/**
 * Setup the audio context when available, or switch to HTML5 Audio mode.
 */
export function setupAudioContext() {
  // If we have already detected that Web Audio isn't supported, don't run this step again.
  if (!Howler.usingWebAudio) {
    return;
  }

  // Check if we are using Web Audio and setup the AudioContext if we are.
  try {
    /**
     * FIXME: remove use of global window object
     */
    const windowCopy: any = window;

    if (typeof AudioContext !== 'undefined') {
      Howler.ctx = new AudioContext();
    } else if (typeof windowCopy.webkitAudioContext !== 'undefined') {
      Howler.ctx = new windowCopy.webkitAudioContext();
    } else {
      Howler.usingWebAudio = false;
    }
  } catch (e) {
    Howler.usingWebAudio = false;
  }

  // If the audio context creation still failed, set using web audio to false.
  if (!Howler.ctx) {
    Howler.usingWebAudio = false;
  }

  // Check if a webview is being used on iOS8 or earlier (rather than the browser).
  // If it is, disable Web Audio as it causes crashing.
  const iOS = (/iP(hone|od|ad)/.test(Howler._navigator && Howler._navigator.platform));
  const appVersion = Howler._navigator && Howler._navigator.appVersion.match(/OS (\d+)_(\d+)_?(\d+)?/);
  const version = appVersion ? parseInt(appVersion[1], 10) : null;
  if (iOS && version && version < 9) {
    const safari = /safari/.test(Howler._navigator && Howler._navigator.userAgent.toLowerCase());
    if (Howler._navigator && !safari) {
      Howler.usingWebAudio = false;
    }
  }

  // Create and expose the master GainNode when using Web Audio (useful for plugins or advanced usage).
  if (Howler.usingWebAudio) {
    Howler.masterGain = (typeof Howler.ctx.createGain === 'undefined') ? Howler.ctx.createGainNode() : Howler.ctx.createGain();
    Howler.masterGain.gain.setValueAtTime(Howler._muted ? 0 : Howler._volume, Howler.ctx.currentTime);
    Howler.masterGain.connect(Howler.ctx.destination);
  }

  // Re-run the setup on Howler.
  Howler._setup();
}
