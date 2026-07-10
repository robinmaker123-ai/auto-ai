package com.autoai.app;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;

@CapacitorPlugin(name = "AutoAiLiveSpeech")
public class AutoAiLiveSpeechPlugin extends Plugin {
    private static final String UTTERANCE_ID = "auto_ai_live_speech";
    private TextToSpeech textToSpeech;
    private boolean ttsReady;
    private PluginCall pendingSpeakCall;
    private String pendingSpeakText;
    private String pendingSpeakLanguage;
    private float pendingSpeakRate = 1.0f;
    private float pendingSpeakVolume = 1.0f;

    @Override
    public void load() {
        initTts();
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        if (text.isEmpty()) {
            call.resolve();
            return;
        }
        String language = normalizeLanguage(call.getString("language", "hi-IN"));
        float rate = call.getFloat("rate", 1.0f);
        float volume = call.getFloat("volume", 1.0f);
        if (textToSpeech == null) initTts();
        if (!ttsReady) {
            pendingSpeakCall = call;
            pendingSpeakText = text;
            pendingSpeakLanguage = language;
            pendingSpeakRate = rate;
            pendingSpeakVolume = volume;
            return;
        }
        speakNow(call, text, language, rate, volume);
    }

    @PluginMethod
    public void stopSpeaking(PluginCall call) {
        if (textToSpeech != null) {
            textToSpeech.stop();
        }
        if (pendingSpeakCall != null) {
            pendingSpeakCall.resolve();
            pendingSpeakCall = null;
        }
        call.resolve();
    }

    @PluginMethod
    public void release(PluginCall call) {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
        ttsReady = false;
        if (pendingSpeakCall != null) {
            pendingSpeakCall.resolve();
            pendingSpeakCall = null;
        }
        pendingSpeakText = null;
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        if (textToSpeech != null) {
            textToSpeech.stop();
            textToSpeech.shutdown();
            textToSpeech = null;
        }
    }

    private void initTts() {
        textToSpeech = new TextToSpeech(getContext(), status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (!ttsReady) {
                if (pendingSpeakCall != null) {
                    pendingSpeakCall.reject("Android text-to-speech is not available.");
                    pendingSpeakCall = null;
                }
                return;
            }
            textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                }

                @Override
                public void onDone(String utteranceId) {
                    resolvePendingSpeak();
                }

                @Override
                public void onError(String utteranceId) {
                    resolvePendingSpeak();
                }
            });
            if (pendingSpeakCall != null && pendingSpeakText != null) {
                speakNow(pendingSpeakCall, pendingSpeakText, pendingSpeakLanguage, pendingSpeakRate, pendingSpeakVolume);
                pendingSpeakText = null;
            }
        });
    }

    private void speakNow(PluginCall call, String text, String language, float rate, float volume) {
        pendingSpeakCall = call;
        textToSpeech.stop();
        textToSpeech.setLanguage(localeFor(language));
        textToSpeech.setSpeechRate(Math.max(0.7f, Math.min(1.4f, rate)));
        Bundle params = new Bundle();
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0.0f, Math.min(1.0f, volume)));
        textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, params, UTTERANCE_ID);
    }

    private void resolvePendingSpeak() {
        PluginCall call = pendingSpeakCall;
        pendingSpeakCall = null;
        if (call != null) {
            call.resolve();
        }
    }

    private String normalizeLanguage(String value) {
        String language = value == null ? "" : value.trim();
        if (language.equals("english")) return "en-US";
        if (language.equals("hindi") || language.equals("hinglish") || language.equals("auto")) return "hi-IN";
        return language.isEmpty() ? "hi-IN" : language;
    }

    private Locale localeFor(String language) {
        if (language.toLowerCase(Locale.US).startsWith("en")) return Locale.US;
        return new Locale("hi", "IN");
    }
}
