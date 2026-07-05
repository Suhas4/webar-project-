/**
 * AdMobService.js — real Google AdMob integration via @capacitor-community/admob.
 *
 * Falls back to safe no-ops (or a simulated rewarded ad) when not running inside
 * the native Capacitor shell — e.g. the plain browser dev server — since the
 * native plugin has no bridge to talk to there.
 *
 * TO GO LIVE WITH REAL ADS:
 *  1. Create an app in https://apps.admob.com and get your real App ID + ad
 *     unit IDs (Banner, Interstitial, Rewarded).
 *  2. Set these in webar-app/.env.local (see .env.local.example):
 *       VITE_ADMOB_APP_ID=ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX
 *       VITE_ADMOB_BANNER_ID=ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *       VITE_ADMOB_INTERSTITIAL_ID=ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *       VITE_ADMOB_REWARDED_ID=ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX
 *  3. Put the real App ID in android/app/src/main/AndroidManifest.xml's
 *     com.google.android.gms.ads.APPLICATION_ID meta-data (already wired to
 *     read from gradle.properties — see variables.gradle).
 *  4. Run `npx cap sync android` and rebuild the app.
 *
 * Until real IDs are set, this uses Google's official public test ad unit
 * IDs — they always serve real (non-monetized) test creatives, which is the
 * correct way to develop/QA against AdMob without risking policy violations
 * from clicking your own live ads.
 */
import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';

export const AD_UNITS = {
  APP_ID:       import.meta.env.VITE_ADMOB_APP_ID       || 'ca-app-pub-3940256099942544~3347511713',
  BANNER:       import.meta.env.VITE_ADMOB_BANNER_ID       || 'ca-app-pub-3940256099942544/6300978111',
  INTERSTITIAL: import.meta.env.VITE_ADMOB_INTERSTITIAL_ID || 'ca-app-pub-3940256099942544/1033173712',
  REWARDED:     import.meta.env.VITE_ADMOB_REWARDED_ID     || 'ca-app-pub-3940256099942544/5224354917',
};

// True until real ad unit IDs are configured — keeps Google's test-ad flag on
// so nobody accidentally serves/clicks live ads against an unconfigured account.
const isTesting = AD_UNITS.BANNER.includes('3940256099942544');

const isNative = () => Capacitor.isNativePlatform();

export async function initAdMob() {
  if (!isNative()) return;
  try {
    await AdMob.initialize({ initializeForTesting: isTesting });
  } catch (err) {
    console.warn('[AdMob] initialize failed:', err);
  }
}

export async function showBanner() {
  if (!isNative()) return;
  try {
    await AdMob.showBanner({
      adId: AD_UNITS.BANNER,
      adSize: BannerAdSize.ADAPTIVE_BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      isTesting,
    });
  } catch (err) {
    console.warn('[AdMob] showBanner failed:', err);
  }
}

export async function hideBanner() {
  if (!isNative()) return;
  try { await AdMob.hideBanner(); } catch (err) { console.warn('[AdMob] hideBanner failed:', err); }
}

export async function removeBanner() {
  if (!isNative()) return;
  try { await AdMob.removeBanner(); } catch (err) { console.warn('[AdMob] removeBanner failed:', err); }
}

export async function showInterstitial() {
  if (!isNative()) return false;
  try {
    await AdMob.prepareInterstitial({ adId: AD_UNITS.INTERSTITIAL, isTesting });
    await AdMob.showInterstitial();
    return true;
  } catch (err) {
    console.warn('[AdMob] interstitial failed:', err);
    return false;
  }
}

/**
 * showRewardedAd — shows a real rewarded video ad natively; in the browser
 * (no native bridge) it simulates a 5-second ad so the reward flow can still
 * be developed/tested without a device build.
 */
export async function showRewardedAd() {
  if (!isNative()) {
    return new Promise((resolve) => {
      setTimeout(() => resolve({ type: 'coins', amount: 1 }), 5000);
    });
  }
  try {
    await AdMob.prepareRewardVideoAd({ adId: AD_UNITS.REWARDED, isTesting });
    const reward = await AdMob.showRewardVideoAd();
    return reward;
  } catch (err) {
    console.warn('[AdMob] rewarded ad failed:', err);
    return null;
  }
}
