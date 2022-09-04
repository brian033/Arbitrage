//imports
import { Balancer, Temple } from "./trading";
import {
    BigNumber,
    FixedFormat,
    FixedNumber,
    formatFixed,
    parseFixed,
    BigNumberish,
} from "@ethersproject/bignumber";
import { PopulatedTransaction, providers, Wallet } from "ethers";
import {
    FlashbotsBundleProvider,
    FlashbotsBundleResolution,
} from "@flashbots/ethers-provider-bundle";

//constants
//check required env variables
const { INFURA, PRIVATE_KEY } = process.env;
if (INFURA === undefined || PRIVATE_KEY === undefined) {
    console.log("One of the env variables is missing!");
    process.exit(1);
}
//ethersjs constants
const provider = new providers.InfuraProvider(1, INFURA);
const wallet = new Wallet(PRIVATE_KEY, provider);
const TEMPLE = "0x470EBf5f030Ed85Fc1ed4C2d36B9DD02e77CF1b7";
const DAI = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
const FRAX = "0x853d955aCEf822Db058eb8505911ED77F175b99e";
//for manual settings
const parameters = {
    templePriceUSDEstimate: "0.82",
    ethPriceUSDEstimate: "1550",
    TEMPLE_STARTAMOUNT: "1000",
};

const TempleToETHER = BigNumber.from(parseFixed(parameters.templePriceUSDEstimate, 18)).div(
    parameters.ethPriceUSDEstimate
);

const { TEMPLE_STARTAMOUNT } = parameters;
//flashbots constants
const FLASHBOTS_ENDPOINT = "https://relay.flashbots.net";

const execArbitrage = async function (
    flashbotsProvider: FlashbotsBundleProvider,
    balancerSwapData: PopulatedTransaction,
    templeSwapData: PopulatedTransaction,
    possibleProfitTemple: BigNumber,
    blockNum: number
) {
    try {
        //calculate the possible ether profit
        const possibleProfitEther = possibleProfitTemple
            .mul(TempleToETHER)
            .div(BigNumber.from(10).pow(18));
        console.log(`Possible profit: ${formatFixed(possibleProfitEther, 18)} ether`);

        //estimate gas
        const balancerPopulatedTx = await wallet.populateTransaction(balancerSwapData);
        const templePopulatedTx = await wallet.populateTransaction(templeSwapData);
        const gasEst = BigNumber.from(balancerPopulatedTx.maxFeePerGas)
            .mul(BigNumber.from(balancerPopulatedTx.gasLimit))
            .add(
                BigNumber.from(templePopulatedTx.maxFeePerGas).mul(
                    BigNumber.from(templePopulatedTx.gasLimit)
                )
            );
        console.log(`Gas estimation: ${formatFixed(gasEst, 18)} ether`);
        //compare the gas, quit if unprofitable
        if (possibleProfitEther.gt(gasEst)) {
            console.log("This might be a profitable arb!, executing...");
        } else {
            console.log("This is not a profitable arb!, abortting...");
            return;
        }
        // send the bundle
        const bundleSubmitResponse = await flashbotsProvider.sendBundle(
            [
                {
                    transaction: balancerPopulatedTx,
                    signer: wallet,
                },
                {
                    transaction: templePopulatedTx,
                    signer: wallet,
                },
            ],
            blockNum + 1
        );
        // By exiting this function (via return) when the type is detected as a "RelayResponseError", TypeScript recognizes bundleSubmitResponse must be a success type object (FlashbotsTransactionResponse) after the if block.
        if ("error" in bundleSubmitResponse) {
            console.warn(bundleSubmitResponse.error.message);
            return;
        }

        //for test in prod purposes, process.exit after a successful arb
        const bundleResolution = await bundleSubmitResponse.wait();
        if (bundleResolution === FlashbotsBundleResolution.BundleIncluded) {
            console.log(`Congrats, included in ${blockNum + 1}`);
            process.exit(0);
        } else if (bundleResolution === FlashbotsBundleResolution.BlockPassedWithoutInclusion) {
            console.log(`Not included in ${blockNum + 1}`);
        } else if (bundleResolution === FlashbotsBundleResolution.AccountNonceTooHigh) {
            console.log("Nonce too high, bailing");
            process.exit(1);
        }
    } catch (e) {
        if ((e as any).reason !== undefined) {
            console.warn((e as any).reason);
        } else {
            console.warn(e as Error);
        }
    }
};

const main = async function () {
    const balancerEngine = new Balancer();
    await balancerEngine.fetchPools();
    const templeEngine = new Temple();
    const flashbotsProvider = await FlashbotsBundleProvider.create(
        provider,
        Wallet.createRandom(),
        FLASHBOTS_ENDPOINT
    );
    provider.on("block", async (blockNum: number) => {
        console.log(`\nCurrent Block Number: ${blockNum}`);

        //balancer first
        let balancerPriceFetching = await balancerEngine.runQueryBatchSwapWithSor({
            tokensIn: TEMPLE,
            tokensOut: DAI,
            amountsIn: TEMPLE_STARTAMOUNT,
        });
        const { deltas, assets } = balancerPriceFetching;
        const balancerStableCoinResult = BigNumber.from(deltas[1]).abs().toString();
        //temple next

        const templeAMMQuote: BigNumber = await templeEngine.getStableForTempleQuote(
            balancerStableCoinResult
        );
        const potentialProfit = templeAMMQuote.sub(
            BigNumber.from("10").pow(18).mul(TEMPLE_STARTAMOUNT)
        );

        // console.log("Balancer Delta:");
        // for (let i = 0; i < 2; i++) {
        //     console.log(`${assets[i]}:${formatFixed(deltas[i], 18)}`);
        // }
        // console.log(`TempleAMM Quote: ${formatFixed(templeAMMQuote, 18)} Temple`);

        console.log(`Potential profit: ${formatFixed(potentialProfit, 18)} Temple`);
        const balancerSwapData = await balancerEngine.constructSwapData(
            balancerPriceFetching,
            wallet
        );
        const templeSwapData = await templeEngine.templeSwapData({
            amountIn: balancerStableCoinResult,
            amountOutMin: templeAMMQuote,
            to: wallet.address,
        });

        await execArbitrage(
            flashbotsProvider,
            balancerSwapData as PopulatedTransaction,
            templeSwapData,
            potentialProfit,
            blockNum
        );
    });
};

main();
