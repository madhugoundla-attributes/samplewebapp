package com.evernym.verity.sdk;

import com.evernym.verity.sdk.exceptions.WalletException;
import com.evernym.verity.sdk.utils.Context;
import com.evernym.verity.sdk.utils.ContextBuilder;
import com.evernym.verity.sdk.wallet.WalletConfig;
import org.hyperledger.indy.sdk.wallet.Wallet;

import java.util.UUID;

public class TestHelpers {
    
    public static Context getContext() throws WalletException {

        String walletName = UUID.randomUUID().toString();
        String walletKey = UUID.randomUUID().toString();
        String endpointUrl = "http://localhost:3000";
        String verityUrl = "http://localhost:3000";

        TestWallet testWallet = new TestWallet(walletName, walletKey);
        return ContextBuilder
                .blank()
                .walletConfig(testWallet)
                .verityUrl(verityUrl)
                .verityPublicDID(testWallet.getVerityPublicVerkey())
                .verityPublicVerKey(testWallet.getVerityPublicVerkey())
                .domainDID(testWallet.getVerityPairwiseDID())
                .verityAgentVerKey(testWallet.getVerityPairwiseVerkey())
                .sdkVerKeyId(testWallet.getSdkPairwiseDID())
                .sdkVerKey(testWallet.getSdkPairwiseVerkey())
                .endpointUrl(endpointUrl)
                .build();
    }

    public static void cleanup(Context context) throws Exception {
        if(context != null) {
            if(! context.walletIsClosed()) {
                context.closeWallet();
            }
            WalletConfig config = context.walletConfig();
            Wallet.deleteWallet(config.config(), config.credential()).get();
        }
    }
}