package com.autoai.app;

import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;

@CapacitorPlugin(name = "AutoAiGoogleAuth")
public class AutoAiGoogleAuthPlugin extends Plugin {
    @PluginMethod
    public void signIn(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || clientId.trim().isEmpty()) {
            call.reject("Google web client ID is required.");
            return;
        }
        GoogleSignInClient client = GoogleSignIn.getClient(
            getActivity(),
            new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(clientId)
                .requestEmail()
                .requestProfile()
                .build()
        );
        startActivityForResult(call, client.getSignInIntent(), "handleSignInResult");
    }

    @ActivityCallback
    private void handleSignInResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        if (data == null) {
            call.reject("Google Sign-In was cancelled.");
            return;
        }
        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(data);
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            String idToken = account.getIdToken();
            if (idToken == null || idToken.isEmpty()) {
                call.reject("Google did not return an ID token.");
                return;
            }
            JSObject payload = new JSObject();
            payload.put("idToken", idToken);
            payload.put("email", account.getEmail());
            payload.put("name", account.getDisplayName());
            Uri photoUrl = account.getPhotoUrl();
            payload.put("picture", photoUrl == null ? null : photoUrl.toString());
            call.resolve(payload);
        } catch (ApiException error) {
            call.reject("Google Sign-In failed with status " + error.getStatusCode() + ".");
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        GoogleSignIn.getClient(getActivity(), GoogleSignInOptions.DEFAULT_SIGN_IN)
            .signOut()
            .addOnCompleteListener(task -> call.resolve());
    }
}
