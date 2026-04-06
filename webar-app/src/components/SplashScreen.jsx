import { useRef, useCallback } from 'react';

export default function SplashScreen({ onDone }) {
  const videoRef = useRef(null);

  // When video ends naturally → advance. Fallback timeout in case video fails.
  const handleEnded = useCallback(() => {
    onDone();
  }, [onDone]);

  const handleCanPlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    // Bug 8 fix: speed up video so it finishes in ~3 seconds
    const duration = video.duration;
    if (duration && duration > 3) {
      video.playbackRate = duration / 3;
    }
    video.play().catch(() => {
      setTimeout(onDone, 3000);
    });
  }, [onDone]);

  const handleError = useCallback(() => {
    // Video failed to load — advance after 2.5s
    setTimeout(onDone, 2500);
  }, [onDone]);

  return (
    <div style={styles.screen}>
      <video
        ref={videoRef}
        src="/splash.mp4"
        style={styles.video}
        playsInline
        muted
        autoPlay
        onCanPlay={handleCanPlay}
        onEnded={handleEnded}
        onError={handleError}
      />
    </div>
  );
}

const styles = {
  screen: {
    position: 'fixed', inset: 0,
    background: '#080C18',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
};
