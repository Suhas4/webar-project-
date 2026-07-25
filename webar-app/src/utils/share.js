import { Capacitor } from '@capacitor/core';

const SHARE_TITLE = 'Memoera';
const SHARE_TEXT = "I'm using Memoera to bring my photos to life with AR — check it out!";
const SHARE_URL = 'https://memoera.in';

// Uses the OS's own native share sheet (same one Instagram/WhatsApp use) so
// the user picks any installed app to share to — no custom peer-to-peer
// transfer, no extra hardware permissions, nothing to bypass. On native
// Android/iOS this is Capacitor's Share plugin; in a plain browser it falls
// back to the Web Share API, and finally to copying the link.
export async function shareMemoera() {
  if (Capacitor.isNativePlatform()) {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL, dialogTitle: 'Share Memoera' });
    return;
  }
  if (navigator.share) {
    await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url: SHARE_URL });
    return;
  }
  await navigator.clipboard.writeText(`${SHARE_TEXT} ${SHARE_URL}`);
  return 'copied';
}
