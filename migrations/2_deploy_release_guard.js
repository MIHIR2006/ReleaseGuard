const ReleaseGuard = artifacts.require("ReleaseGuard");

module.exports = function (deployer, network, accounts) {
  // constructor(minBounty = 0.1 ETH, firstAttester = accounts[1])
  deployer.deploy(ReleaseGuard, web3.utils.toWei("0.1", "ether"), accounts[1]);
};
