import * as wasm from "@emurgo/cardano-serialization-lib-nodejs";
import axios from "axios";
import dotenv from "dotenv";
import { Buffer } from "safe-buffer";
import { assetsToValue, valueToAssets } from "./utils.mjs";
import { BlockFrostAPI } from "@blockfrost/blockfrost-js";

dotenv.config();

const idTestnet = process.env.ID_TESTNET;

export const BlockFrost = new BlockFrostAPI({
  isTestnet: true,
  projectId: idTestnet,
});

async function blockFrostReq(URL) {
  try {
    // Adds Blockfrost project_id to req header
    const configBuilder = {
      headers: {
        project_id: idTestnet,
      },
    };
    const response = await axios.get(URL, configBuilder);
    //console.log(response);
    return response.data;
  } catch (error) {
    console.log(error.response);
    return error;
  }
}

export async function getWalletData(addr) {
  try {
    const uTXOs = function (addrsBench32) {
      return `https://cardano-testnet.blockfrost.io/api/v0/addresses/${addrsBench32}/utxos`;
    };
    const URL = uTXOs(addr);
    const response = await blockFrostReq(URL);
    //console.log(response);

    return response;
  } catch (e) {
    console.log(e);
  }
}
export async function getUtxos(addr) {
  const response = await getWalletData(addr);
  //console.log(response);

  let utxos = [];

  response.forEach((element) => {
    const value = assetsToValue(element.amount);

    const input = wasm.TransactionInput.new(
      wasm.TransactionHash.from_bytes(Buffer.from(element.tx_hash, "hex")),
      element.tx_index
    );

    const output = wasm.TransactionOutput.new(
      wasm.Address.from_bech32(addr),
      value
    );

    const utxo = wasm.TransactionUnspentOutput.new(input, output);
    utxos.push(utxo);
  });
  return utxos;
}

export const getParams = async () => {
  try {
    const latestURL =
      "https://cardano-testnet.blockfrost.io/api/v0/blocks/latest";
    const paramsURL =
      "https://cardano-testnet.blockfrost.io/api/v0/epochs/latest/parameters";

    const p = await blockFrostReq(paramsURL);
    const l = await blockFrostReq(latestURL);
    return {
      linearFee: {
        minFeeA: p.min_fee_a.toString(),
        minFeeB: p.min_fee_b.toString(),
      },
      minUtxo: "1000000", //p.min_utxo, minUTxOValue protocol paramter has been removed since Alonzo HF. Calulation of minADA works differently now, but 1 minADA still sufficient for now
      poolDeposit: p.pool_deposit,
      keyDeposit: p.key_deposit,
      coinsPerUtxoWord: "34482",
      maxValSize: 5000,
      priceMem: 5.77e-2,
      priceStep: 7.21e-5,
      maxTxSize: parseInt(p.max_tx_size),
      slot: parseInt(l.slot),
    };
  } catch (e) {
    console.log(e);
  }
};
export async function submitTx(transaction) {
  try {
    const CBORTx = Buffer.from(transaction.to_bytes(), "hex").toString("hex");
    const submitionHash = await BlockFrost.txSubmit(CBORTx);
    console.log(`tx Submited tiwh txHas ${submitionHash}`);
    return submitionHash;
  } catch (e) {
    console.log(e);
  }
}
