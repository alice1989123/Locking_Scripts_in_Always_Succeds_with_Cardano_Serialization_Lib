import { Buffer } from "safe-buffer";

import * as wasm from "./custom_modules/@emurgo/cardano-serialization-lib-nodejs/cardano_serialization_lib.js";

import { languageViews } from "./languageViews.mjs";
import {
  assetsToValue,
  fromAscii,
  fromHex,
  getTradeDetails,
  lovelacePercentage,
  toBytesNum,
  toHex,
  valueToAssets,
} from "./utils.mjs";

import { getUtxos, getParams, submitTx } from "./blockFrost.mjs";
import coinSelection from "./coinSelection.mjs";

//import * as wasm from "./node_modules/@emurgo/cardano-serialization-lib-nodejs/cardano_serialization_lib.js";

function harden(num) {
  return 0x80000000 + num;
}

const walletKey =
  "xprv1hrf7sr7salkxk0e3s33yx7szp67wc9wr4cyq7xlp294ysz3am99w45zqy5cx6jrjwfecalvrnur0vv8w2hd69ye6q387ahmxgzfe3ah7va2n032hv72m6umewapjhqlcmm830y0ftll86z29rleq4emgpv0cjqg2";
const baseAddr =
  "addr_test1qqcula4fd6nr92zx2jyl59eqy574f8uhg98dhfys7zer23p03az6tzlxgrxk5a9ev6taetv6ljkyr7rcx4rljm7qya2syeq06w";
const rootKey = wasm.Bip32PrivateKey.from_bech32(walletKey);
const accountKey = rootKey
  .derive(harden(1852)) // purpose
  .derive(harden(1815)) // coin type
  .derive(harden(0)); // account #0

const prvKey = accountKey
  .derive(0) // external
  .derive(0)
  .to_raw_key();

const encodeCbor = (val) => Buffer.from(val.to_bytes()).toString("hex");

const scriptCbor = "4d01000033222220051200120011";

const scriptAddress =
  "addr_test1wpnlxv2xv9a9ucvnvzqakwepzl9ltx7jzgm53av2e9ncv4sysemm8";

const scriptAddreswasm = wasm.Address.from_bech32(scriptAddress);
const getScript = (scriptCbor) => {
  return wasm.PlutusScript.new(fromHex(scriptCbor));
};

const clientAddress = baseAddr;

const baseAddrwasm = wasm.Address.from_bech32(baseAddr);

const script = getScript(scriptCbor);

async function initTx(protocolParameters) {
  const txBuilder = wasm.TransactionBuilder.new(
    wasm.LinearFee.new(
      wasm.BigNum.from_str(protocolParameters.linearFee.minFeeA),
      wasm.BigNum.from_str(protocolParameters.linearFee.minFeeB)
    ),
    wasm.BigNum.from_str(protocolParameters.minUtxo),
    wasm.BigNum.from_str(protocolParameters.poolDeposit),
    wasm.BigNum.from_str(protocolParameters.keyDeposit),
    protocolParameters.maxValSize,
    protocolParameters.maxTxSize,
    protocolParameters.priceMem,
    protocolParameters.priceStep,
    wasm.LanguageViews.new(Buffer.from(languageViews, "hex"))
  );
  const datums = wasm.PlutusList.new();
  const outputs = wasm.TransactionOutputs.new();
  return { txBuilder, datums, outputs };
}

async function unLockFunds(utxoid, index) {
  //const protocolParameters = await initTx();

  const protocolParameters = await getParams();

  const { txBuilder, datums, outputs } = await initTx(protocolParameters);

  const input = wasm.TransactionInput.new(
    wasm.TransactionHash.from_bytes(Buffer.from(utxoid, "hex")),
    index
  );

  const collaterals = await getUtxos(baseAddr);

  let inputs = wasm.TransactionInputs.new();

  inputs.add(input);

  const outPut = wasm.TransactionOutput.new(
    wasm.Address.from_bech32(baseAddr),
    wasm.Value.new(wasm.BigNum.from_str("7000000"))
  );
  /*  const OutPuts = wasm.TransactionOutputs.new();
  OutPuts.add(outPut); */

  txBuilder.add_output(outPut);

  txBuilder.add_input(
    wasm.Address.from_bech32(scriptAddress),
    input,
    wasm.Value.new(wasm.BigNum.from_str("10000000"))
  );

  const collateralInputs = wasm.TransactionInputs.new();
  collaterals.forEach((utxo) => {
    //console.log(utxo.input());
    const bytes = utxo.input().to_bytes();

    collateralInputs.add(wasm.TransactionInput.from_bytes(bytes));
  });

  txBuilder.set_collateral(collateralInputs);

  const getDatum = () => {
    const datumVals = wasm.PlutusList.new();
    datumVals.add(wasm.PlutusData.new_integer(wasm.BigInt.from_str("42")));

    return wasm.PlutusData.new_constr_plutus_data(
      wasm.ConstrPlutusData.new(wasm.Int.new_i32(0), datumVals)
    );
  };

  const getDatum_ = () => {
    const datumVals = wasm.PlutusList.new();
    datumVals.add(wasm.PlutusData.new_integer(wasm.Int.new_i32(42)));

    return datumVals;
  };
  const datum = wasm.PlutusData.new_integer(wasm.BigInt.from_str("42"));
  console.log(
    Buffer.from(wasm.hash_plutus_data(datum).to_bytes(), "hex").toString("hex")
  );

  //
  //getDatum();
  //console.log(datum.as_constr_plutus_data().tag().as_i32());

  datums.add(datum);

  const transactionWitnessSet = wasm.TransactionWitnessSet.new();
  const redeemers = wasm.Redeemers.new();
  const redeemer = wasm.Redeemer.new(
    wasm.RedeemerTag.new_spend(),
    wasm.BigNum.from_str("0"),
    datum,
    wasm.ExUnits.new(
      wasm.BigNum.from_str("7000000"),
      wasm.BigNum.from_str("3000000000")
    )
  );
  //console.log(Buffer.from(redeemer.to_bytes(), "hex").toString("hex"));
  redeemers.add(redeemer);
  const scripts = wasm.PlutusScripts.new();
  scripts.add(script);

  console.log(`this is the script${scripts.to_bytes()}`);

  txBuilder.set_redeemers(wasm.Redeemers.from_bytes(redeemers.to_bytes()));

  txBuilder.set_plutus_data(wasm.PlutusList.from_bytes(datums.to_bytes()));

  console.log(txBuilder);

  txBuilder.set_plutus_scripts(
    wasm.PlutusScripts.from_bytes(scripts.to_bytes())
  );

  console.log(txBuilder);

  txBuilder.set_fee(wasm.BigNum.from_str("3000000"));

  //txBuilder.add_change_if_needed(wasm.Address.from_bech32(baseAddr));

  const txBody = txBuilder.build();
  console.log(Buffer.from(txBody.to_bytes(), "hex").toString("hex"));
  const txHash = wasm.hash_transaction(txBody);
  const vkeysWitnesses = wasm.Vkeywitnesses.new();
  const vkeyWitness = wasm.make_vkey_witness(txHash, prvKey);
  vkeysWitnesses.add(vkeyWitness);

  transactionWitnessSet.set_vkeys(vkeysWitnesses);
  transactionWitnessSet.set_plutus_scripts(scripts);
  console.log(
    `this is the datum ${Buffer.from(datum.to_bytes(), "hex").toString("hex")}`
  );

  transactionWitnessSet.set_plutus_data(datums);

  console.log(
    `this is the redeemers ${Buffer.from(redeemers.to_bytes(), "hex").toString(
      "hex"
    )}`
  );

  transactionWitnessSet.set_redeemers(redeemers);

  const tx = wasm.Transaction.new(txBody, transactionWitnessSet);
  const txHex = Buffer.from(tx.to_bytes()).toString("hex");
  console.log(txHex);

  const Hash = await submitTx(tx);
  console.log(Hash);
}

/* async function LockFunds(coins) {
  const protocolParameters = await getParams();

  const { txBuilder, datums } = await initTx(protocolParameters);

  const datum = wasm.PlutusData.new_integer(wasm.BigInt.from_str("42"));
  console.log(
    Buffer.from(wasm.hash_plutus_data(datum).to_bytes(), "hex").toString("hex")
  );
  console.log(Buffer.from(datum.to_bytes()));

  console.log(Buffer.from(datum.to_bytes(), "hex").toString("hex"));

  datums.add(datum);

  const outPut = wasm.TransactionOutput.new(
    scriptAddreswasm,
    wasm.Value.new(wasm.BigNum.from_str(coins))
  );
  outPut.set_data_hash(wasm.hash_plutus_data(datum));

  const utxos = await getUtxos(baseAddr);

  const input = utxos[0]; //await coinSelection.randomImprove(utxos, outPuts, 20);
  console.log(input.input(), input.output().amount());

  txBuilder.add_input(
    baseAddrwasm,
    wasm.TransactionInput.from_bytes(input.input().to_bytes()),
    wasm.Value.from_bytes(input.output().amount().to_bytes())
  );

  txBuilder.add_output(outPut);

  const transactionWitnessSet = wasm.TransactionWitnessSet.new();

  txBuilder.add_change_if_needed(wasm.Address.from_bech32(baseAddr));

  const txBody = txBuilder.build();
  console.log(Buffer.from(txBody.to_bytes(), "hex").toString("hex"));
  const txHash = wasm.hash_transaction(txBody);
  const vkeysWitnesses = wasm.Vkeywitnesses.new();
  const vkeyWitness = wasm.make_vkey_witness(txHash, prvKey);
  vkeysWitnesses.add(vkeyWitness);

  transactionWitnessSet.set_vkeys(vkeysWitnesses);

  const tx = wasm.Transaction.new(txBody, transactionWitnessSet);
  const txHex = Buffer.from(tx.to_bytes()).toString("hex");
  console.log(txHex);

  const Hash = await submitTx(tx);
  console.log(Hash);
}

LockFunds("10000000"); */

//;
/* 

}

console.log(gethash("D87981182A")); */

unLockFunds(
  "94e6b42e5300cdd73cc07df84eb415c2a6b261fd4ea622588c68ac28052ec4b3",
  //"60017161fcbd2146587a91a4c075197e8fd2c1a10e87b01c85a4bede7efc133d",
  0
);
