/// <reference types="node" />
export default class assetFingerprint {
    hashBuf: Uint8Array;
    constructor(policyId?: Uint8Array, assetName?: Uint8Array);
    fromHash(hash: Buffer): this;
    fromBech32(fingerprint: string): this;
    fingerprint(): string;
    hash(): string;
    prefix(): string;
}
