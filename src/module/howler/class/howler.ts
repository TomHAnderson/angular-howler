import { using } from 'rxjs';
import { Howl } from './howl';
import { Codecs } from './codecs';

// tslint:disable:variable-name
export class Howler {
  private _usingWebAudio = false;
  private _autoUnlock = true;
  private _audioUnlocked = false;
  private _mobileUnloaded = false;
  private _html5AudioPool: any[];
  private html5PoolSize: number;
  private howls: Howl[];
  private _noAudio = false;

  constructor(
    public codecs: Codecs
  ) {
  }

  // Scratch buffer for enabling iOS to dispose of web audio buffers correctly, as per:
  // http://stackoverflow.com/questions/24119684
  private _scratchBuffer: any;

  public ctx: any; // FIXME

  get usingWebAudio(): boolean {
    return this._usingWebAudio;
  }

  get autoUnlock(): boolean {
    return this._autoUnlock;
  }

  get noAudio(): boolean {
    return this._noAudio;
  }

  public register(howl: Howl) {
    this.howls.push(howl);
  }


  /**
   * Some browsers/devices will only allow audio to be played after a user interaction.
   * Attempt to automatically unlock audio on the first user interaction.
   * Concept from: http://paulbakaus.com/tutorials/html5/web-audio-on-ios/
   */
  public unlockAudio(): this {
    // Only run this if Web Audio is supported and it hasn't already been unlocked.
    if (this._audioUnlocked || ! this.ctx) {
      return;
    }

    this._audioUnlocked = false;
    this._autoUnlock = false;

    // Some mobile devices/platforms have distortion issues when opening/closing tabs and/or web views.
    // Bugs in the browser (especially Mobile Safari) can cause the sampleRate to change from 44100 to 48000.
    // By calling Howler.unload(), we create a new AudioContext with the correct sampleRate.
    if (! this._mobileUnloaded && this.ctx?.sampleRate !== 44100) {
      this._mobileUnloaded = true;
      this.unload();
    }

    // Scratch buffer for enabling iOS to dispose of web audio buffers correctly, as per:
    // http://stackoverflow.com/questions/24119684
    this._scratchBuffer = this.ctx?.createBuffer(1, 1, 22050);

    // Call this method on touch start to create and play a buffer,
    // then check if the audio actually played to determine if
    // audio has now been unlocked on iOS, Android, etc.
    const unlock = (e) => {
      // Create a pool of unlocked HTML5 Audio objects that can
      // be used for playing sounds without user interaction. HTML5
      // Audio objects must be individually unlocked, as opposed
      // to the WebAudio API which only needs a single activation.
      // This must occur before WebAudio setup or the source.onended
      // event will not fire.
      while (this._html5AudioPool.length < this.html5PoolSize) {
        try {
          const audioNode = new Audio();

          // Mark this Audio object as unlocked to ensure it can get returned
          // to the unlocked pool when released.
          audioNode._unlocked = true;

          // Add the audio node to the pool.
          this._releaseHtml5Audio(audioNode);
        } catch (e) {
          this.noAudio = true;
          break;
        }
      }

      // Loop through any assigned audio nodes and unlock them.
      for (var i=0; i<self._howls.length; i++) {
        if (!self._howls[i]._webAudio) {
          // Get all of the sounds in this Howl group.
          var ids = self._howls[i]._getSoundIds();

          // Loop through all sounds and unlock the audio nodes.
          for (var j=0; j<ids.length; j++) {
            var sound = self._howls[i]._soundById(ids[j]);

            if (sound && sound._node && !sound._node._unlocked) {
              sound._node._unlocked = true;
              sound._node.load();
            }
          }
        }
      }

      // Fix Android can not play in suspend state.
      self._autoResume();

      // Create an empty buffer.
      var source = self.ctx.createBufferSource();
      source.buffer = self._scratchBuffer;
      source.connect(self.ctx.destination);

      // Play the empty buffer.
      if (typeof source.start === 'undefined') {
        source.noteOn(0);
      } else {
        source.start(0);
      }

      // Calling resume() on a stack initiated by user gesture is what actually unlocks the audio on Android Chrome >= 55.
      if (typeof self.ctx.resume === 'function') {
        self.ctx.resume();
      }

      // Setup a timeout to check that we are unlocked on the next event loop.
      source.onended = function() {
        source.disconnect(0);

        // Update the unlocked state and prevent this check from happening again.
        self._audioUnlocked = true;

        // Remove the touch start listener.
        document.removeEventListener('touchstart', unlock, true);
        document.removeEventListener('touchend', unlock, true);
        document.removeEventListener('click', unlock, true);

        // Let all sounds know that audio has been unlocked.
        for (var i=0; i<self._howls.length; i++) {
          self._howls[i]._emit('unlock');
        }
      };
    };

    // Setup a touch start listener to attempt an unlock in.
    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('touchend', unlock, true);
    document.addEventListener('click', unlock, true);

    return self;
  },
}
