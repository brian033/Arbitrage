import { parseFixed, BigNumber } from "@ethersproject/bignumber";
import { BalancerSDK, BalancerSdkConfig, Network, SwapType } from "@balancer-labs/sdk";
import { Vault__factory, Vault } from "@balancer-labs/typechain";
import { Contract, providers, Wallet } from "ethers";
import { templeAbi } from "../abi/templeAmmABI";
import { QueryWithSorOutput } from "@balancer-labs/sdk";
export class Balancer {
    balancer: BalancerSDK;

    constructor() {
        const config: BalancerSdkConfig = {
            network: Network.MAINNET,
            rpcUrl: `https://mainnet.infura.io/v3/${process.env.INFURA}`,
        };
        this.balancer = new BalancerSDK(config);
    }
    async fetchPools() {
        const poolsFetched = await this.balancer.swaps.fetchPools();
        if (!poolsFetched) {
            console.log(`Error fetching pools data.`);
            return;
        }
    }
    async runQueryBatchSwapWithSor({
        tokensIn,
        tokensOut,
        amountsIn,
    }: {
        tokensIn: string;
        tokensOut: string;
        amountsIn: string | number;
    }) {
        let queryResult = await this.balancer.swaps.queryBatchSwapWithSor({
            tokensIn: [tokensIn],
            tokensOut: [tokensOut],
            swapType: 0,
            amounts: [parseFixed(amountsIn.toString(), 18).toString()],
            fetchPools: {
                fetchPools: false, // Because pools were previously fetched we can reuse to speed things up
                fetchOnChain: false,
            },
        });
        return queryResult;
    }
    async constructSwapData(queryResult: QueryWithSorOutput, wallet: Wallet) {
        const vaultInterface = Vault__factory.createInterface();
        const walletAddress = wallet.address;
        const res = vaultInterface.encodeFunctionData("batchSwap", [
            SwapType.SwapExactIn,
            queryResult.swaps,
            queryResult.assets,
            {
                fromInternalBalance: false,
                // These can be different addresses!
                recipient: walletAddress,
                sender: walletAddress,
                toInternalBalance: false,
            },
            queryResult.deltas,
            Math.floor(Date.now() / 1000 + 30),
        ]);
        const populatedTransaction = {
            data: res,
            to: "0xBA12222222228d8Ba445958a75a0704d566BF2C8", //balancer vault
        };
        return populatedTransaction;
    }
}
export class Temple {
    templeStableAMMRouter: Contract;
    constructor() {
        this.templeStableAMMRouter = new Contract(
            "0x98257C876ACe5009e7B97843F8c71b3AE795c71E",
            templeAbi,
            new providers.InfuraProvider(1, process.env.INFURA)
        );
    }
    async getOwner() {
        return await this.templeStableAMMRouter.owner();
    }
    async getStableForTempleQuote(stableAmount: string | number) {
        return await this.templeStableAMMRouter.swapExactStableForTempleQuote(
            "0x6021444f1706f15465bEe85463BCc7d7cC17Fc03",
            stableAmount.toString()
        );
    }
    async templeSwapData({
        amountIn,
        amountOutMin,
        to,
    }: {
        amountIn: string;
        amountOutMin: string | BigNumber;
        to: string;
    }) {
        const res = await this.templeStableAMMRouter.populateTransaction.swapExactStableForTemple(
            amountIn,
            amountOutMin,
            "0x853d955aCEf822Db058eb8505911ED77F175b99e", //frax
            to,
            Math.floor(Date.now() / 1000 + 30) //deadline
        );
        return res;
    }
}
