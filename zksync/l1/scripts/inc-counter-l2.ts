/* eslint-disable prettier/prettier */
import { ethers } from 'hardhat';
import '@nomiclabs/hardhat-ethers';
import { Deployer } from './deploy';
import { Wallet } from 'ethers';

import { richWallet } from './rich_wallet';
import { web3Provider, zkSyncUrl } from './utils';
import { formatEther } from 'ethers/lib/utils';
import { Provider, utils, Contract } from 'zksync-web3';
import { L1Executor__factory } from '../typechain/factories/l1/contracts/governance/L1Executor__factory';
import ZkSyncBridgeExecutorUpgradable from '../../l2/artifacts-zk/l2/contracts/governance/ZkSyncBridgeExecutorUpgradable.sol/ZkSyncBridgeExecutorUpgradable.json';

const provider = web3Provider();
const zkProvider = new Provider(zkSyncUrl());

const COUNTER_ADDRESS = '0x1F0151386fB0AbBF0273238dF5E9bc519DE5e20B';
const L1_EXECUTOR_ADDR = '0x52281EE6681AbAbeBc680A006114B4Dd72a9C7A3';
const L2_EXECUTOR = '0x29c6fF2E3D04a9f37e7af1fF9b38C9E2e9079FfA';

// L2 to L2
async function main() {
	const wallet = new Wallet(richWallet[0].privateKey, provider);
	const zkWallet = new Wallet(richWallet[0].privateKey, zkProvider);

	const CounterContract = new Contract(
		COUNTER_ADDRESS,
		counterContract.abi,
		zkWallet
	);

	console.log(
		'CounterContract value before Incrementing:',
		await (await CounterContract.value()).toString()
	);
	// console.log(
	// 	'CounterContract last called address:',
	// 	await CounterContract.lastAddress()
	// );
	// console.log(
	// 	'CounterContract lastAddressL1:',
	// 	await CounterContract.lastAddressL1()
	// );
	console.log(
		'CounterContract last governance address:',
		await CounterContract.governance()
	);

	const gasPrice = await provider.getGasPrice();

	const deployer = new Deployer({
		deployWallet: wallet,
		governorAddress: wallet.address,
		verbose: true,
	});

	const governorAgent = deployer.defaultGovernanceAgent(wallet);
	const zkSync = deployer.zkSyncContract(wallet);
	console.log('governorAgent L1:', governorAgent.address);

	const ZkGovBridge = new Contract(
		L2_EXECUTOR,
		ZkSyncBridgeExecutorUpgradable.abi,
		zkWallet
	);

	// // Change Governor
	// const txRes = await ZkGovBridge.setGovernance(L1_EXECUTOR_ADDR);
	// await txRes.wait();

	// console.log(`New Counter governor ${await CounterContract.governance()}`);

	const IZkSyncBridgeExecutorUpgradable = new ethers.utils.Interface(
		ZkSyncBridgeExecutorUpgradable.abi
	);

	const data = IZkSyncBridgeExecutorUpgradable.encodeFunctionData('queue', [
		[COUNTER_ADDRESS],
		[ethers.utils.parseEther('0')],
		['increment()'],
		[new Uint8Array()],
		[false],
	]);

	const gasLimitForZk = await zkProvider.estimateL1ToL2Execute({
		contractAddress: deployer.addresses.ZkGovernanceExecutor,
		calldata: data,
		caller: utils.applyL1ToL2Alias(L1_EXECUTOR_ADDR),
	});

	const baseCostForZk = await zkSync.l2TransactionBaseCost(
		gasPrice,
		gasLimitForZk,
		utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT
	);

	const txSendZk = await wallet.sendTransaction({
		to: governorAgent.address,
		value: baseCostForZk.mul(2),
		gasLimit: 10_000_000,
		gasPrice,
	});

	await txSendZk.wait();

	const L1EXE = L1Executor__factory.connect(L1_EXECUTOR_ADDR, wallet);

	const encodedValZk = L1EXE.interface.encodeFunctionData('callZkSync', [
		zkSync.address,
		L2_EXECUTOR,
		data,
		gasLimitForZk,
		utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT,
	]);

	// // send via governor agent
	const govTx = await governorAgent.execute(
		L1_EXECUTOR_ADDR,
		baseCostForZk,
		encodedValZk,
		{ gasPrice, gasLimit: 10_000_000 }
	);

	await govTx.wait();

	const l2Response2 = await zkProvider.getL2TransactionFromPriorityOp(govTx);
	await l2Response2.wait();

	const actionSetId = await ZkGovBridge.getActionsSetById(1);

	console.log('Action set by id:', actionSetId);

	console.log(ethers.utils.formatEther(baseCostForZk));

	const executeAction = await ZkGovBridge.execute(1);
	await executeAction.wait();

	// console.log(
	// 	'\n============================================================================'
	// );

	// console.log(
	// 	'new gov address on L2:',
	// 	utils.applyL1ToL2Alias(governorAgent.address)
	// );

	// console.log('wallet address on L2:', utils.applyL1ToL2Alias(wallet.address));
	// console.log('zkSync address on L2:', utils.applyL1ToL2Alias(zkSync.address));
	// console.log(
	// 	'executor address on L2:',
	// 	utils.applyL1ToL2Alias(L1_EXECUTOR_ADDR)
	// );

	// console.log(
	// 	'\n============================================================================'
	// );

	// console.log(
	// 	'UNDO ALIASING',
	// 	utils.undoL1ToL2Alias(utils.applyL1ToL2Alias(L1_EXECUTOR_ADDR))
	// );

	// console.log(
	// 	'\n============================================================================'
	// );

	// const counterInterface = new ethers.utils.Interface(counterContract.abi);
	// const dataToIncrement = counterInterface.encodeFunctionData('increment', []);

	// const gasLimit = await zkProvider.estimateL1ToL2Execute({
	// 	contractAddress: COUNTER_ADDRESS,
	// 	calldata: dataToIncrement,
	// 	caller: utils.applyL1ToL2Alias(L1_EXECUTOR_ADDR),
	// });

	// const baseCost = await zkSync.l2TransactionBaseCost(
	// 	gasPrice,
	// 	gasLimit,
	// 	utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT
	// );

	// console.log('BASE COST', formatEther(baseCost));

	// const encodedVal = L1EXE.interface.encodeFunctionData('callZkSync', [
	// 	zkSync.address,
	// 	COUNTER_ADDRESS,
	// 	dataToIncrement,
	// 	gasLimit,
	// 	utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT,
	// ]);

	// send directly using wrapper
	// const tx = await L1EXE.callZkSync(
	// 	zkSync.address,
	// 	COUNTER_ADDRESS,
	// 	dataToIncrement,
	// 	gasLimit,
	// 	utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT,
	// 	{
	// 		value: baseCost,
	// 		gasPrice,
	// 	}
	// );

	// const requestL2TransactionEncodedToIncrement =
	// 	zkSync.interface.encodeFunctionData('requestL2Transaction', [
	// 		COUNTER_ADDRESS,
	// 		0,
	// 		dataToIncrement,
	// 		gasLimit,
	// 		utils.REQUIRED_L1_TO_L2_GAS_PER_PUBDATA_LIMIT,
	// 		[new Uint8Array()],
	// 		wallet.address,
	// 	]);

	// const govBalanceBefore = await provider.getBalance(governorAgent.address);
	// console.log('Before balance:', formatEther(govBalanceBefore));

	// const tx = await wallet.sendTransaction({
	// 	to: zkSync.address,
	// 	value: baseCost,
	// 	data: requestL2TransactionEncodedToIncrement,
	// 	gasPrice,
	// 	gasLimit: 10_000_000,
	// });

	// const tx = await governorAgent.execute(
	// 	zkSync.address,
	// 	baseCost,
	// 	requestL2TransactionEncodedToIncrement,
	// 	{ gasPrice, gasLimit: 10_000_000 }
	// );

	// const txSend = await wallet.sendTransaction({
	// 	to: governorAgent.address,
	// 	value: baseCost.mul(2),
	// 	gasLimit: 10_000_000,
	// 	gasPrice,
	// });

	// await txSend.wait();

	// // // send via governor agent
	// const tx = await governorAgent.execute(
	// 	L1_EXECUTOR_ADDR,
	// 	baseCost,
	// 	encodedVal,
	// 	{ gasPrice, gasLimit: 10_000_000 }
	// );

	// await tx.wait();

	// const l2Response = await zkProvider.getL2TransactionFromPriorityOp(tx);
	// const l2Receipt = await l2Response.wait();

	// // console.log(l2Receipt);

	// const govBalanceAfter = await provider.getBalance(governorAgent.address);
	// console.log('After balance:', formatEther(govBalanceAfter));

	// console.log(
	// 	'\n============================================================================'
	// );

	console.log(
		'CounterContract value after Incrementing:',
		await (await CounterContract.value()).toString()
	);
	// console.log(
	// 	'CounterContract last caller of L2:',
	// 	await CounterContract.lastAddress()
	// );

	// console.log(
	// 	'CounterContract lastAddressL1:',
	// 	await CounterContract.lastAddressL1()
	// );

	console.log(
		'CounterContract governance address:',
		await CounterContract.governance()
	);
	// console.log(
	// 	'CounterContract governance address L2:',
	// 	await CounterContract.governanceL2()
	// );
	// console.log(
	// 	'L1/L1 address: governance == AddressAliasHelper.undoL1ToL2Alias(msg.sender):',
	// 	await CounterContract.areSame()
	// );
	// console.log(
	// 	'L2/L2 address:governanceL2 == msg.sender:',
	// 	await CounterContract.areSameTwo()
	// );
}

const counterContract = {
	_format: 'hh-zksolc-artifact-1',
	contractName: 'Counter',
	sourceName: 'l2/contracts/governance/Counter.sol',
	abi: [
		{
			inputs: [
				{
					internalType: 'address',
					name: 'governanceExecutor',
					type: 'address',
				},
			],
			stateMutability: 'nonpayable',
			type: 'constructor',
		},
		{
			inputs: [
				{
					internalType: 'string',
					name: 'message',
					type: 'string',
				},
			],
			name: 'UnauthorizedEthereumExecutor',
			type: 'error',
		},
		{
			inputs: [],
			name: 'governance',
			outputs: [
				{
					internalType: 'address',
					name: '',
					type: 'address',
				},
			],
			stateMutability: 'view',
			type: 'function',
		},
		{
			inputs: [],
			name: 'increment',
			outputs: [],
			stateMutability: 'nonpayable',
			type: 'function',
		},
		{
			inputs: [
				{
					internalType: 'address',
					name: 'newGovernance',
					type: 'address',
				},
			],
			name: 'setGovernance',
			outputs: [],
			stateMutability: 'nonpayable',
			type: 'function',
		},
		{
			inputs: [],
			name: 'value',
			outputs: [
				{
					internalType: 'uint256',
					name: '',
					type: 'uint256',
				},
			],
			stateMutability: 'view',
			type: 'function',
		},
	],
	bytecode:
		'0x0002000000000002000100000001035500000060011002700000003d0010019d0000000101200190000000300000c13d0000008001000039000000400010043f0000000001000031000000040110008c000000c70000413d0000000101000367000000000101043b000000e001100270000000450210009c0000003f0000213d000000480210009c0000009c0000613d000000490110009c000000c70000c13d0000000001000416000000000110004c000000c70000c13d000000040100008a00000000011000310000003f02000041000000000310004c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d0000000101000039000000000101041a0000004001100197000000400200043d00000000001204350000003d010000410000003d0320009c000000000102401900000040011002100000004e011001c7000000ef0001042e0000000001000416000000000110004c000000c70000c13d00000000010000310000009f02100039000000200300008a000000000232016f0000003e0320009c000000650000413d000000430100004100000000001004350000004101000039000000040010043f0000004401000041000000f000010430000000460210009c000000b10000613d000000470110009c000000c70000c13d0000000001000416000000000110004c000000c70000c13d000000040100008a00000000011000310000003f02000041000000000310004c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d0000000101000039000000000101041a00000000020004110000004a02200041000000000112013f0000004001100198000000c90000c13d000000000100041a000000010200008a000000000221004b000000e60000c13d000000430100004100000000001004350000001101000039000000040010043f0000004401000041000000f000010430000000400020043f0000001f0210018f00000001030003670000000504100272000000730000613d00000000050000190000000506500210000000000763034f000000000707043b000000800660003900000000007604350000000105500039000000000645004b0000006b0000413d000000000520004c000000820000613d0000000504400210000000000343034f00000003022002100000008004400039000000000504043300000000052501cf000000000525022f000000000303043b0000010002200089000000000323022f00000000022301cf000000000252019f00000000002404350000003f02000041000000200310008c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d000000800100043d000000400210009c000000c70000213d000000000000041b0000000102000039000000000302041a0000004103300197000000000113019f000000000012041b0000002001000039000001000010044300000120000004430000004201000041000000ef0001042e0000000001000416000000000110004c000000c70000c13d000000040100008a00000000011000310000003f02000041000000000310004c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d000000000100041a000000800010043f0000004f01000041000000ef0001042e0000000001000416000000000110004c000000c70000c13d000000040100008a00000000011000310000003f02000041000000200310008c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d00000004010000390000000101100367000000000101043b000000400210009c000000db0000a13d0000000001000019000000f000010430000000400100043d00000044021000390000004b03000041000000000032043500000024021000390000001a0300003900000000003204350000004c0200004100000000002104350000000402100039000000200300003900000000003204350000003d020000410000003d0310009c000000000102801900000040011002100000004d011001c7000000f0000104300000000102000039000000000302041a0000004103300197000000000113019f000000000012041b0000003d01000041000000400200043d0000003d0320009c00000000010240190000004001100210000000ef0001042e0000000101100039000000000010041b0000003d01000041000000400200043d0000003d0320009c00000000010240190000004001100210000000ef0001042e000000ee00000432000000ef0001042e000000f00001043000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffff00000000000000000000000000000000000000000000000100000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000002000000000000000000000000000000400000010000000000000000004e487b7100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002400000000000000000000000000000000000000000000000000000000000000000000000000000000ab033ea800000000000000000000000000000000000000000000000000000000ab033ea900000000000000000000000000000000000000000000000000000000d09de08a000000000000000000000000000000000000000000000000000000003fa4f245000000000000000000000000000000000000000000000000000000005aa6e675000000000000000000000000eeeeffffffffffffffffffffffffffffffffeeef4f6e6c7920676f7665726e616e636520697320616c6c6f776564000000000000c121b761000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000008000000000000000009308e523054396340decc870aa67da334794b5fd2182789cdaf56dbeeb9784c5',
	deployedBytecode:
		'0x0002000000000002000100000001035500000060011002700000003d0010019d0000000101200190000000300000c13d0000008001000039000000400010043f0000000001000031000000040110008c000000c70000413d0000000101000367000000000101043b000000e001100270000000450210009c0000003f0000213d000000480210009c0000009c0000613d000000490110009c000000c70000c13d0000000001000416000000000110004c000000c70000c13d000000040100008a00000000011000310000003f02000041000000000310004c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d0000000101000039000000000101041a0000004001100197000000400200043d00000000001204350000003d010000410000003d0320009c000000000102401900000040011002100000004e011001c7000000ef0001042e0000000001000416000000000110004c000000c70000c13d00000000010000310000009f02100039000000200300008a000000000232016f0000003e0320009c000000650000413d000000430100004100000000001004350000004101000039000000040010043f0000004401000041000000f000010430000000460210009c000000b10000613d000000470110009c000000c70000c13d0000000001000416000000000110004c000000c70000c13d000000040100008a00000000011000310000003f02000041000000000310004c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d0000000101000039000000000101041a00000000020004110000004a02200041000000000112013f0000004001100198000000c90000c13d000000000100041a000000010200008a000000000221004b000000e60000c13d000000430100004100000000001004350000001101000039000000040010043f0000004401000041000000f000010430000000400020043f0000001f0210018f00000001030003670000000504100272000000730000613d00000000050000190000000506500210000000000763034f000000000707043b000000800660003900000000007604350000000105500039000000000645004b0000006b0000413d000000000520004c000000820000613d0000000504400210000000000343034f00000003022002100000008004400039000000000504043300000000052501cf000000000525022f000000000303043b0000010002200089000000000323022f00000000022301cf000000000252019f00000000002404350000003f02000041000000200310008c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d000000800100043d000000400210009c000000c70000213d000000000000041b0000000102000039000000000302041a0000004103300197000000000113019f000000000012041b0000002001000039000001000010044300000120000004430000004201000041000000ef0001042e0000000001000416000000000110004c000000c70000c13d000000040100008a00000000011000310000003f02000041000000000310004c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d000000000100041a000000800010043f0000004f01000041000000ef0001042e0000000001000416000000000110004c000000c70000c13d000000040100008a00000000011000310000003f02000041000000200310008c000000000300001900000000030240190000003f01100197000000000410004c000000000200a0190000003f0110009c00000000010300190000000001026019000000000110004c000000c70000c13d00000004010000390000000101100367000000000101043b000000400210009c000000db0000a13d0000000001000019000000f000010430000000400100043d00000044021000390000004b03000041000000000032043500000024021000390000001a0300003900000000003204350000004c0200004100000000002104350000000402100039000000200300003900000000003204350000003d020000410000003d0310009c000000000102801900000040011002100000004d011001c7000000f0000104300000000102000039000000000302041a0000004103300197000000000113019f000000000012041b0000003d01000041000000400200043d0000003d0320009c00000000010240190000004001100210000000ef0001042e0000000101100039000000000010041b0000003d01000041000000400200043d0000003d0320009c00000000010240190000004001100210000000ef0001042e000000ee00000432000000ef0001042e000000f00001043000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffff00000000000000000000000000000000000000000000000100000000000000008000000000000000000000000000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000002000000000000000000000000000000400000010000000000000000004e487b7100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002400000000000000000000000000000000000000000000000000000000000000000000000000000000ab033ea800000000000000000000000000000000000000000000000000000000ab033ea900000000000000000000000000000000000000000000000000000000d09de08a000000000000000000000000000000000000000000000000000000003fa4f245000000000000000000000000000000000000000000000000000000005aa6e675000000000000000000000000eeeeffffffffffffffffffffffffffffffffeeef4f6e6c7920676f7665726e616e636520697320616c6c6f776564000000000000c121b761000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000200000008000000000000000009308e523054396340decc870aa67da334794b5fd2182789cdaf56dbeeb9784c5',
	linkReferences: {},
	deployedLinkReferences: {},
	factoryDeps: {},
};

main().catch((error) => {
	throw error;
});
