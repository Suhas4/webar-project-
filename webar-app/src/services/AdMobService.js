/**
 * AdMobService.js
 *
 * NOTE: The @capacitor-community/admob native plugin requires Gradle / Kotlin
 * versions that conflict with the current build system.
 *
 * TO ENABLE REAL ADS:
 *  1. Open the project in Android Studio
 *  2. Add to app/build.gradle:
 *       implementation 'com.google.android.gms:play-services-ads:23.0.0'
 *  3. Add to AndroidManifest.xml inside <application>:
 *       <meta-data
 *           android:name="com.google.android.gms.ads.APPLICATION_ID"
 *           android:value="YOUR_ADMOB_APP_ID"/>
 *  4. Run `npm install @capacitor-community/admob@6.2.0 --legacy-peer-deps`
 *     after upgrading the Android Gradle plugin.
 *
 * Until then, this file provides a safe no-op implementation so the app
 * compiles and runs normally.
 */

export const AD_UNITS = {
  APP_ID:       'ca-app-pub-3940256099942544~3347511713',  // replace with real ID
  BANNER:       'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: 'ca-app-pub-3940256099942544/1033173712',
  REWARDED:     'ca-app-pub-3940256099942544/5224354917',
};

export async function initAdMob()     { /* no-op until native plugin is added */ }
export async function showBanner()    { /* no-op */ }
export async function hideBanner()    { /* no-op */ }
export async function removeBanner()  { /* no-op */ }
export async function showInterstitial() { return false; }

/**
 * showRewardedAd — simulates a 5-second rewarded ad.
 * Replace the body with the real AdMob call once the plugin is installed.
 */
export function showRewardedAd() {
  return new Promise((resolve) => {
    // Simulate a 5-second ad view
    setTimeout(() => resolve({ type: 'coins', amount: 1 }), 5000);
  });
}
