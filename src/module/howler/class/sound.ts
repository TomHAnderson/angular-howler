/**
 * Setup the sound object, which each node attached to a Howl group is contained in.
 */
import { SoundConfig } from './sound-config';
import { Howl } from './howl';
import { SoundFile } from './sound-file';

// tslint:disable:variable-name
export class Sound {
  /**
   * The id of this sound in the howl assigned from the howl
   */
  private id: number;

  /**
   * Copy of configuration used for reset
   */
  private configCopy: object;

  /**
   * Audio node (WebAudio & HTML5)
   */
  private node: any;

  /**
   * Event listener?
   */
  private loadFunction: any;

  /**
   * Listen for errors (http://dev.w3.org/html5/spec-author-view/spec.html#mediaerror).
   */
  private errorFunction: any;

  /**
   *
   * @param howl The parent howl object
   * @param config Optional SoundConfig or fetched from the howl object
   */

  constructor(
    private howl: Howl,
    private _config: SoundConfig,
    private _soundFile: SoundFile
  ) {
    this.howl = howl;
    this.configCopy = this._config.getObjectCopy();

    /**
     * Adjust config based on howl state
     */
    if (Howler._muted || this._config.muted || this.howl.config.muted) {
      this._config.volume = 0;
    }

    if (this.howl.webAudio) {
      // Create the gain node for controlling volume (the source will connect to this).
      this.node = (typeof Howler.ctx.createGain === 'undefined')
        ? Howler.ctx.createGainNode()
        : Howler.ctx.createGain();
      this.node.gain.setValueAtTime(this._config.volume, Howler.ctx.currentTime);
      this.node.paused = true;
      this.node.connect(Howler.masterGain);
    } else if (!Howler.noAudio) {
      // Get an unlocked Audio object from the pool.
      this.node = Howler._obtainHtml5Audio();

      // Listen for errors (http://dev.w3.org/html5/spec-author-view/spec.html#mediaerror).
      this.errorFunction = this.errorListener.bind(this);
      this.node.addEventListener('error', this.errorFunction, false);

      // Listen for 'canplaythrough' event to let us know the sound is ready.
      this.loadFunction = this.loadListener.bind(this);
      this.node.addEventListener(Howler._canPlayEvent, this.loadFunction, false);

      // Setup the new audio node.
      this.node.src = this._soundFile.src;
      this.node.preload = this.howl.config.preload === true ? 'auto' : this.howl.config.preload;
      this.node.volume = this._config.volume * Howler.volume();

      // Begin loading the source.
      this.node.load();
    }

    this.id = this.howl.register(this);
  }

  /**
   * HTML5 Audio error listener callback.
   */
  private errorListener(): this {
    // Fire an error event and pass back the code.
    this.howl.emit('loaderror', this.id, this.node.error ? this.node.error.code : 0);

    // Clear the event listener.
    this.node.removeEventListener('error', this.errorFunction, false);

    return this;
  }

  /**
   * HTML5 Audio canplaythrough listener callback.
   */
  private loadListener(): this {
    // Round up the duration to account for the lower precision in HTML5 Audio.
    this.howl.config.duration = Math.ceil(this.node.duration * 10) / 10;

    // Setup a sprite if none is defined.
    if (Object.keys(this.howl.config.sprite).length === 0) {
      this.howl.config.sprite = {__default: [0, this.howl.config.duration * 1000]};
    }

    if (this.howl.state !== 'loaded') {
      this.howl.state = 'loaded';
      this.howl.emit('load');
      this.howl.loadQueue();
    }

    // Clear the event listener.
    this.node.removeEventListener(Howler._canPlayEvent, this.loadFunction, false);

    return this;
  }

  /**
   * Reset the parameters of this sound to the original state (for recycle).
   */
  public reset(): this {
    this.config.exchangeObject(this.configCopy);

    // Generate a new ID so that it isn't confused with the previous sound.
//// FIXME:  is this necessary??
////    self._id = ++Howler._counter;

    return this;
  }

  /**
   * If someone wants to read the config ensure they cannot change it.
   */
  get config(): any {
    return this._config.getObjectCopy();
  }

  get soundFile(): SoundFile {
    return this._soundFile;
  }
}
