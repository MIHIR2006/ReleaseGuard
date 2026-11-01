// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title ReleaseGuard
 * @notice Trust registry for software releases and blockchain-node snapshots,
 *         with an ETH bug-bounty escrow attached to every release.
 *
 * Report 3 (software trust):   releases are anchored with artifact hash, source commit,
 *                              attestation (provenance) hash and a proofDigest set by an attester.
 * Report 2 (node infra):       artifacts of type NodeSnapshot can be looked up by hash
 *                              (verifyByHash) before a node restores them.
 * Report 1 (bug bounty):       anyone can fund a release's bounty pool; researchers submit
 *                              findings; attesters approve and the reward is paid by pull payment.
 *
 * Invariant (checked in tests): address(this).balance >= totalPools + totalPending
 * (equality holds unless ETH is force-sent via selfdestruct).
 */
contract ReleaseGuard {
    // ───────────── Types ─────────────
    enum ArtifactType  { Binary, NodeSnapshot, Library }
    enum Status        { Pending, Verified, Compromised }
    enum Severity      { Low, Medium, High, Critical }
    enum FindingStatus { Open, Approved, Rejected }

    struct Release {
        uint256      id;
        ArtifactType artifactType;
        string       name;
        string       version;
        bytes32      artifactHash;     // SHA-256 of the file
        string       sourceCommit;     // git commit the build came from
        bytes32      attestationHash;  // SHA-256 of the provenance JSON
        address      publisher;
        uint256      timestamp;
        Status       status;
        bytes32      proofDigest;      // hash of a verification / test report
        uint256      bountyPool;       // ETH held for findings
    }

    struct Finding {
        uint256       id;
        uint256       releaseId;
        address       reporter;
        bytes32       reportHash;      // hash of the off-chain report
        Severity      severity;
        FindingStatus status;
        uint256       reward;
    }

    // ───────────── State ─────────────
    address public owner;
    uint256 public minBounty;
    uint256 public releaseCount;
    uint256 public findingCount;
    uint256 public totalPools;     // sum of all bountyPool values
    uint256 public totalPending;   // sum of all pendingWithdrawals

    mapping(uint256 => Release) public releases;
    mapping(uint256 => Finding) public findings;
    mapping(address => bool)    public attesters;
    mapping(bytes32 => uint256) public releaseByHash;       // artifactHash => release id (blocks duplicates)
    mapping(address => uint256) public pendingWithdrawals;  // pull-payment balances

    // ───────────── Events ─────────────
    event ReleaseRegistered(uint256 indexed id, ArtifactType artifactType, string name, string version, address indexed publisher);
    event ReleaseAttested(uint256 indexed id, address indexed attester, bytes32 proofDigest);
    event ReleaseRevoked(uint256 indexed id, address indexed by);
    event BountyFunded(uint256 indexed id, address indexed funder, uint256 amount);
    event FindingSubmitted(uint256 indexed findingId, uint256 indexed releaseId, address indexed reporter, Severity severity);
    event FindingResolved(uint256 indexed findingId, bool approved, uint256 reward);
    event Withdrawn(address indexed to, uint256 amount);
    event AttesterAdded(address indexed attester);
    event AttesterRemoved(address indexed attester);

    // ───────────── Modifiers ─────────────
    modifier onlyOwner() {
        require(msg.sender == owner, "ReleaseGuard: caller is not the owner");
        _;
    }

    modifier onlyAttester() {
        require(attesters[msg.sender], "ReleaseGuard: caller is not an attester");
        _;
    }

    modifier releaseExists(uint256 _id) {
        require(_id > 0 && _id <= releaseCount, "ReleaseGuard: release does not exist");
        _;
    }

    // ───────────── Constructor ─────────────
    /**
     * @param _minBounty      Minimum ETH (in wei) accepted by fundBounty.
     * @param _firstAttester  Optional extra attester (use address(0) for none). The deployer is always an attester.
     */
    constructor(uint256 _minBounty, address _firstAttester) {
        owner = msg.sender;
        attesters[msg.sender] = true;
        emit AttesterAdded(msg.sender);
        if (_firstAttester != address(0) && _firstAttester != msg.sender) {
            attesters[_firstAttester] = true;
            emit AttesterAdded(_firstAttester);
        }
        minBounty = _minBounty;
    }

    // ───────────── Admin ─────────────
    function addAttester(address _attester) external onlyOwner {
        require(_attester != address(0), "ReleaseGuard: invalid address");
        require(!attesters[_attester], "ReleaseGuard: already an attester");
        attesters[_attester] = true;
        emit AttesterAdded(_attester);
    }

    function removeAttester(address _attester) external onlyOwner {
        require(_attester != owner, "ReleaseGuard: cannot remove owner");
        require(attesters[_attester], "ReleaseGuard: not an attester");
        attesters[_attester] = false;
        emit AttesterRemoved(_attester);
    }

    // ───────────── Releases (Report 3 and Report 2) ─────────────
    function registerRelease(
        ArtifactType        _type,
        string calldata     _name,
        string calldata     _version,
        bytes32             _artifactHash,
        string calldata     _sourceCommit,
        bytes32             _attestationHash
    ) external returns (uint256) {
        require(bytes(_name).length > 0,    "ReleaseGuard: name cannot be empty");
        require(bytes(_version).length > 0, "ReleaseGuard: version cannot be empty");
        require(_artifactHash != bytes32(0), "ReleaseGuard: hash cannot be zero");
        require(releaseByHash[_artifactHash] == 0, "ReleaseGuard: hash already registered");

        releaseCount++;
        uint256 id = releaseCount;

        Release storage r = releases[id];
        r.id              = id;
        r.artifactType    = _type;
        r.name            = _name;
        r.version         = _version;
        r.artifactHash    = _artifactHash;
        r.sourceCommit    = _sourceCommit;
        r.attestationHash = _attestationHash;
        r.publisher       = msg.sender;
        r.timestamp       = block.timestamp;
        r.status          = Status.Pending;

        releaseByHash[_artifactHash] = id;

        emit ReleaseRegistered(id, _type, _name, _version, msg.sender);
        return id;
    }

    function attestRelease(uint256 _id, bytes32 _proofDigest)
        external
        onlyAttester
        releaseExists(_id)
    {
        Release storage r = releases[_id];
        require(r.status == Status.Pending, "ReleaseGuard: release is not pending");
        r.status      = Status.Verified;
        r.proofDigest = _proofDigest;
        emit ReleaseAttested(_id, msg.sender, _proofDigest);
    }

    function revokeRelease(uint256 _id)
        external
        onlyAttester
        releaseExists(_id)
    {
        Release storage r = releases[_id];
        require(r.status != Status.Compromised, "ReleaseGuard: already compromised");
        r.status = Status.Compromised;
        emit ReleaseRevoked(_id, msg.sender);
    }

    // ───────────── Bounty (Report 1) ─────────────
    function fundBounty(uint256 _id) external payable releaseExists(_id) {
        require(msg.value >= minBounty, "ReleaseGuard: below minimum bounty");
        releases[_id].bountyPool += msg.value;
        totalPools               += msg.value;
        emit BountyFunded(_id, msg.sender, msg.value);
    }

    function submitFinding(uint256 _releaseId, bytes32 _reportHash, Severity _severity)
        external
        releaseExists(_releaseId)
        returns (uint256)
    {
        require(_reportHash != bytes32(0), "ReleaseGuard: report hash cannot be zero");
        require(msg.sender != releases[_releaseId].publisher, "ReleaseGuard: publisher cannot report own release");

        findingCount++;
        findings[findingCount] = Finding({
            id:         findingCount,
            releaseId:  _releaseId,
            reporter:   msg.sender,
            reportHash: _reportHash,
            severity:   _severity,
            status:     FindingStatus.Open,
            reward:     0
        });

        emit FindingSubmitted(findingCount, _releaseId, msg.sender, _severity);
        return findingCount;
    }

    /**
     * @notice Attester approves or rejects a finding.
     *         Approve: `_reward` moves from the release's pool to the reporter's pending balance.
     *         A Critical approval also marks the release Compromised.
     */
    function resolveFinding(uint256 _findingId, bool _approve, uint256 _reward)
        external
        onlyAttester
    {
        require(_findingId > 0 && _findingId <= findingCount, "ReleaseGuard: finding does not exist");
        Finding storage f = findings[_findingId];
        require(f.status == FindingStatus.Open, "ReleaseGuard: finding already resolved");
        require(msg.sender != f.reporter, "ReleaseGuard: reporter cannot resolve own finding");

        Release storage r = releases[f.releaseId];

        if (_approve) {
            require(_reward <= r.bountyPool, "ReleaseGuard: reward exceeds pool");
            f.status = FindingStatus.Approved;
            f.reward = _reward;

            r.bountyPool                -= _reward;
            totalPools                  -= _reward;
            pendingWithdrawals[f.reporter] += _reward;
            totalPending                += _reward;

            if (f.severity == Severity.Critical) {
                r.status = Status.Compromised;
            }
        } else {
            require(_reward == 0, "ReleaseGuard: rejected finding has no reward");
            f.status = FindingStatus.Rejected;
        }

        emit FindingResolved(_findingId, _approve, _reward);
    }

    /// @notice Pull payment: reporter claims approved rewards.
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        require(amount > 0, "ReleaseGuard: nothing to withdraw");

        // effects before interaction
        pendingWithdrawals[msg.sender] = 0;
        totalPending                  -= amount;

        (bool ok, ) = payable(msg.sender).call{value: amount}("");
        require(ok, "ReleaseGuard: transfer failed");

        emit Withdrawn(msg.sender, amount);
    }

    // ───────────── Views ─────────────
    function checkIntegrity(uint256 _id, bytes32 _hash)
        external
        view
        releaseExists(_id)
        returns (bool)
    {
        return releases[_id].artifactHash == _hash;
    }

    /// @notice Lookup by file hash (used by scripts/verify-snapshot.js).
    function verifyByHash(bytes32 _hash)
        external
        view
        returns (bool found, uint256 id, Status status, ArtifactType artifactType)
    {
        id = releaseByHash[_hash];
        if (id == 0) {
            return (false, 0, Status.Pending, ArtifactType.Binary);
        }
        Release storage r = releases[id];
        return (true, id, r.status, r.artifactType);
    }

    function getRelease(uint256 _id)
        external
        view
        releaseExists(_id)
        returns (Release memory)
    {
        return releases[_id];
    }

    function getFinding(uint256 _id) external view returns (Finding memory) {
        require(_id > 0 && _id <= findingCount, "ReleaseGuard: finding does not exist");
        return findings[_id];
    }

    function isAttester(address _addr) external view returns (bool) {
        return attesters[_addr];
    }
}
