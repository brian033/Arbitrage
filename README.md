# Arbitrage between temple LBP pair and temple AMM pair

## USAGE:
* Clone repo.
* Approve unlimited `TEMPLE` spending to `0xBA12222222228d8Ba445958a75a0704d566BF2C8`(balancer vault)
* Approve unlimited `FRAX` spending to `0x98257C876ACe5009e7B97843F8c71b3AE795c71E`(temple amm router)
* ```$ export INFURA=<your_infura_key>```
* ```$ export PRIVATE_KEY=<your_private_key>```
* Edit `parameters` in `bot/index.ts`
* `$ yarn start`

## LOGIC:
#### On every block, the bot will: 
1. Get balancer temple > dai quote using SOR(smart order routing) from balancer-sdk
2. Assume dai and frax always peg, pass the dai output from last step as frax input to get frax > temple quote
3. Subtract the output from step 2 with the input from step 1 to get possible 
4. Use the price parameters in the `parameters` to convert temple profit to ether and estimate the net profit in ether
5. Estimate the gas of both balancer swap and temple swap and sum them up, catch errors if they happen.
6. Subtract estimated net profit in ether with the estimated gas cost to get possible `gross profit`
7. If the gross profit is > 0, pack the transactions as a flashbot bundle and send it to the flashbots relay
8. Wait for the result, in this version the program will exit(0) after a success swap

## Possible update:
1. Could do a slight modification to make it swap the dai to frax and keep looping the process.
2. Could refactor the codes using multicall and better architecture to speed up the process
3. Could add another tx to make it an atomic process of Temple > DAI > FRAX > Temple
