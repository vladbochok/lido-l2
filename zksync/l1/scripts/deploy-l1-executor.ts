import { web3Provider } from "./utils/utils";
import { OssifiableProxy__factory } from "../typechain/index";
import { L1Executor__factory } from "../typechain";
import { Wallet } from "ethers";

const provider = web3Provider();

const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const AGENT_ADDRESS = process.env.CONTRACTS_L1_GOVERNANCE_AGENT_ADDR as string;

async function main() {
  // without ethers.Wallet -> HardhatError: HH5: HardhatContext is not created.
  const wallet = new Wallet(PRIVATE_KEY, provider);

  const L1ExecutorContractImpl = await new L1Executor__factory(wallet).deploy();

  console.log(`L1Executor implementation:${L1ExecutorContractImpl.address}`);

  const L1ExecutorContractProxy = await new OssifiableProxy__factory(
    wallet
  ).deploy(L1ExecutorContractImpl.address, AGENT_ADDRESS, "0x", {
    gasLimit: 10_000_000,
  });

  console.log(`L1Executor proxy:${L1ExecutorContractProxy.address}`);

  const L1Executor = new L1Executor__factory(wallet).attach(
    L1ExecutorContractProxy.address
  );

  console.log(`L1Executor: ${L1Executor.address}`);

  const initResponseTx = await L1Executor.initialize({ gasLimit: 10_000_000 });
  await initResponseTx.wait();
  const transferOwnerResponseTx = await L1Executor.transferOwnership(
    AGENT_ADDRESS
  );
  await transferOwnerResponseTx.wait();

  console.log("Owner of the L1 Executor:", await L1Executor.owner());
  console.log(`L1_EXECUTOR_ADDR=${L1ExecutorContractProxy.address}`);
}

main().catch((error) => {
  throw error;
});
