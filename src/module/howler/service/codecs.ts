/**
 * Check for browser support for various codecs
 */
export class Codecs {
  private codecs: any;

  constructor(navigator: any = null) {
    let audioTest = null;

    // Must wrap in a try/catch because IE11 in server mode throws an error.
    try {
      audioTest = (typeof Audio !== 'undefined') ? new Audio() : null;
    } catch (err) {
      return;
    }

    if (!audioTest || typeof audioTest.canPlayType !== 'function') {
      return;
    }

    const mpegTest = audioTest.canPlayType('audio/mpeg;').replace(/^no$/, '');

    // Opera version <33 has mixed MP3 support, so we need to check for and block it.
    const checkOpera = navigator && navigator.userAgent.match(/OPR\/([0-6].)/g);
    const isOldOpera = (checkOpera && parseInt(checkOpera[0].split('/')[1], 10) < 33);

    this.codecs = {
      mp3: !!(!isOldOpera && (mpegTest || audioTest.canPlayType('audio/mp3;').replace(/^no$/, ''))),
      mpeg: !!mpegTest,
      opus: !!audioTest.canPlayType('audio/ogg; codecs="opus"').replace(/^no$/, ''),
      ogg: !!audioTest.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/, ''),
      oga: !!audioTest.canPlayType('audio/ogg; codecs="vorbis"').replace(/^no$/, ''),
      wav: !!audioTest.canPlayType('audio/wav; codecs="1"').replace(/^no$/, ''),
      aac: !!audioTest.canPlayType('audio/aac;').replace(/^no$/, ''),
      caf: !!audioTest.canPlayType('audio/x-caf;').replace(/^no$/, ''),
      m4a: !!(audioTest.canPlayType('audio/x-m4a;')
        || audioTest.canPlayType('audio/m4a;')
        || audioTest.canPlayType('audio/aac;')).replace(/^no$/, ''),
      m4b: !!(audioTest.canPlayType('audio/x-m4b;')
        || audioTest.canPlayType('audio/m4b;')
        || audioTest.canPlayType('audio/aac;')).replace(/^no$/, ''),
      mp4: !!(audioTest.canPlayType('audio/x-mp4;')
        || audioTest.canPlayType('audio/mp4;')
        || audioTest.canPlayType('audio/aac;')).replace(/^no$/, ''),
      weba: !!audioTest.canPlayType('audio/webm; codecs="vorbis"').replace(/^no$/, ''),
      webm: !!audioTest.canPlayType('audio/webm; codecs="vorbis"').replace(/^no$/, ''),
      dolby: !!audioTest.canPlayType('audio/mp4; codecs="ec-3"').replace(/^no$/, ''),
      flac: !!(audioTest.canPlayType('audio/x-flac;') || audioTest.canPlayType('audio/flac;')).replace(/^no$/, '')
    };
  }

  public has(codec) {
    return this.codecs[codec];
  }
}
