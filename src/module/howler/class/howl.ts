import { SoundFile } from './sound-file';
import { setupAudioContext } from './setup-audio-context';
import { HowlConfig } from './howl-config';
import { Sound } from './sound';
import { Howler } from './howler';
import { EventListeners } from './event-listeners';
import { SoundConfig } from './sound-config';

export class Howl {
  private duration: number = 0;
  private _state: string = 'unloaded';
  private _soundArray: Sound[] = [];
  private endTimers: object = {};
  private queue: any[] = [];
  private playLock: boolean = false;
  private _webAudio: boolean = false;

  // Global sound states for this Howl
  private muted: boolean;
  private loop: boolean;
  private volume: number;
  private rate: number;

  constructor(
    private howler: Howler,
    private _config: HowlConfig
  ) {
    // If we don't have an AudioContext created yet, run the setup.
    if (! this.howler.ctx) {
      setupAudioContext();
    }

    // Web Audio or HTML5 Audio?
    this._webAudio = this.howler.usingWebAudio && ! this._config.html5;

      // Automatically try to enable audio.
    if (typeof this.howler.ctx !== 'undefined' && this.howler.ctx && this.howler.autoUnlock) {
      this.howler.unlockAudio();
    }

    // Keep track of this Howl group in the global controller.
    this.howler.register(this);

    // If they selected autoplay, add a play event to the load queue.
    if (this._config.autoplay) {
      this.queue.push({
        event: 'play',
        action: () => {
          self.play();
        }
      });
    }

    // Load the source file unless otherwise specified.
    if (this._config.preload && ! this._config.preload) {
      self.load();
    }
  }

  // Avoid other objets manipulating the config so only send copies.
  get config(): any {
    return this._config.getObjectCopy();
  }

  get webAudio(): boolean {
    return this._webAudio;
  }

  get soundArray(): Sound[] {
    return this._soundArray;
  }

  get state(): string {
    return this._state;
  }

  set state(value: string) {
    this._state = value;
  }

  /**
   * Register a new sound when it is created
   */
  public register(sound: Sound): number {
    this._soundArray.push(sound);

    // FIXME:  ensure indexes are not reused!
    return this._soundArray.length;
  }

  /**
   * Emit all events of a specific type and pass the sound id.
   * @param  event Event name.
   * @param  id    Sound ID.
   * @param  msg   Message to go with event.
   */
  public emit(event: string, id: number = null, msg: any = null): this {
    const events = this._config.eventListeners['on' + event];

    // Loop through event store and fire all functions.
    for (const thisEvent of events) {
      // Only fire the listener if the correct ID is used.
      if (! thisEvent.id || thisEvent.id === id || event === 'load') {
        setTimeout(fn => fn.call(this, id, msg)
          .bind(self, thisEvent.fn), 0);

        // If this event was setup with `once`, remove it.
        if (thisEvent.once) {
          this.off(event, thisEvent.fn, thisEvent.id);
        }
      }
    }

    // Pass the event type into load queue so that it can continue stepping.
    this.loadQueue(event);

    return this;
  }

  /**
   * Remove a custom event. Call without parameters to remove all events.
   * @param  event Event name.
   * @param  fn    Listener to remove. Leave empty to remove all.
   * @param  id    (optional) Only remove events for this sound.
   */
  // tslint:disable-next-line:ban-types
  public off(event: string, fn: Function = null, id: number = null): this {
    const events = this._config.eventListeners['on' + event];
    let i = 0;

    // Allow passing just an event and ID.
    if (typeof fn === 'number') {
      id = fn;
      fn = null;
    }

    if (fn || id) {
      // Loop through event store and remove the passed function.
      for (const thisEvent of events) {
        const isId = (id === thisEvent.id);
        if (fn === thisEvent.fn && isId || !fn && isId) {
          events.splice(i, 1);
          break;
        }
      }
    } else if (event) {
      // Clear out all events of this type.
      this._config.eventListeners['on' + event] = [];
    } else {
      // Clear out all events of every type.
      this._config.eventListeners = new EventListeners();
    }

    return this;
  }

  /**
   * Queue of actions initiated before the sound has loaded.
   * These will be called in sequence, with the next only firing
   * after the previous has finished executing (even if async like play).
   * @return {Howl} return self
   */
  public loadQueue(event = null) {

    if (this.queue.length > 0) {
      const task = this.queue[0];

      // Remove this task if a matching event was passed.
      if (task.event === event) {
        this.queue.shift();
        this.loadQueue();
      }

      // Run the task if no event type is passed.
      if (!event) {
        task.action();
      }
    }

    return this;
  }

  /**
   * Preload an audio file.
   */
  public load(): this {
    const self = this;
    let url = null;

    // If no audio is available, quit immediately.
    if (this.howler.noAudio) {
      self.emit('loaderror', null, 'No audio support.');
      return;
    }

    // Loop through the sources and pick the first one that is compatible.
    let foundSound;
    this.soundArray.forEach(sound => {
      let ext;
      let str;

      // If we've already found a url do not parse additional sounds
      if (foundSound) {
        continue;
      }

      if (sound.config.format) {
        // If an extension was specified, use that instead.
        ext = sound.config.format;
      } else {
        // Make sure the source is a string.
        str = sound.config.src;
        if (typeof str !== 'string') {
          self.emit('loaderror', null, 'Non-string found in selected audio sources - ignoring.');
          continue;
        }

        // Extract the file extension from the URL or base64 data URI.
        ext = /^data:audio\/([^;,]+);/i.exec(str);
        if (!ext) {
          ext = /\.([^.]+)$/.exec(str.split('?', 1)[0]);
        }

        if (ext) {
          ext = ext[1].toLowerCase();
        }
      }

      // Log a warning if no extension was found.
      if (!ext) {
        console.warn('No file extension was found. Consider using the "format" property or specify an extension.');
      }

      // Check if this extension is available.
      if (ext && this.howler.codecs.has(ext)) {
        foundSound = sound;
//        url = sound.soundFile.src;
      }
    });

    if (! foundSound) {
      this.emit('loaderror', null, 'No codec support for selected audio sources.');
      return;
    }

    self._src = url;
    self._state = 'loading';

    // If the hosting page is HTTPS and the source isn't,
    // drop down to HTML5 Audio to avoid Mixed Content errors.
    if (windowObject?.location.protocol === 'https:' && url.slice(0, 5) === 'http:') {
      self.config.html5 = true;
      self._webAudio = false;
    }

    // Create a new sound object and add it to the pool.
    const soundConfig = new SoundConfig();
    soundConfig.exchangeObject({
      muted: this.muted,
      loop: this.loop,
      volume: this.volume,
      rate: this.rate
    });

    new Sound(this, soundConfig, soundFile);

    // Load and decode the audio data for playback.
    if (self._webAudio) {
      loadBuffer(self);
    }

    return self;
  }




}

    /**
     * Load the audio file.
     * @return {Howler} return self
     */
    public load() {
      const self = this;
      let url = null;

      // If no audio is available, quit immediately.
      if (Howler.noAudio) {
        self._emit('loaderror', null, 'No audio support.');
        return;
      }

      // Make sure our source is in an array.
      if (typeof self._src === 'string') {
        self._src = [self._src];
      }

      // Loop through the sources and pick the first one that is compatible.
      for (let i = 0; i < self._src.length; i++) {
        let ext;
        let str;

        if (self._format && self._format[i]) {
          // If an extension was specified, use that instead.
          ext = self._format[i];
        } else {
          // Make sure the source is a string.
          str = self._src[i];
          if (typeof str !== 'string') {
            self._emit('loaderror', null, 'Non-string found in selected audio sources - ignoring.');
            continue;
          }

          // Extract the file extension from the URL or base64 data URI.
          ext = /^data:audio\/([^;,]+);/i.exec(str);
          if (!ext) {
            ext = /\.([^.]+)$/.exec(str.split('?', 1)[0]);
          }

          if (ext) {
            ext = ext[1].toLowerCase();
          }
        }

        // Log a warning if no extension was found.
        if (!ext) {
          console.warn('No file extension was found. Consider using the "format" property or specify an extension.');
        }

        // Check if this extension is available.
        if (ext && Howler.codecs(ext)) {
          url = self._src[i];
          break;
        }
      }

      if (!url) {
        self._emit('loaderror', null, 'No codec support for selected audio sources.');
        return;
      }

      self._src = url;
      self._state = 'loading';

      // If the hosting page is HTTPS and the source isn't,
      // drop down to HTML5 Audio to avoid Mixed Content errors.
      if (windowObject?.location.protocol === 'https:' && url.slice(0, 5) === 'http:') {
        self._html5 = true;
        self._webAudio = false;
      }

      // Create a new sound object and add it to the pool.
      const unused = new Sound(self);

      // Load and decode the audio data for playback.
      if (self._webAudio) {
        loadBuffer(self);
      }

      return self;
    },

    /**
     * Play a sound or resume previous playback.
     * @param  sprite   Sprite name for sprite playback or sound id to continue previous.
     * @param  internal Internal Use: true prevents event firing.
     * @return Sound ID.
     */
    public play(sprite, internal) {
      const self = this;
      let id = null;

      // Determine if a sprite, sound id or nothing was passed
      if (typeof sprite === 'number') {
        id = sprite;
        sprite = null;
      } else if (typeof sprite === 'string' && self._state === 'loaded' && !self._sprite[sprite]) {
        // If the passed sprite doesn't exist, do nothing.
        return null;
      } else if (typeof sprite === 'undefined') {
        // Use the default sound sprite (plays the full audio length).
        sprite = '__default';

        // Check if there is a single paused sound that isn't ended.
        // If there is, play that sound. If not, continue as usual.
        if (!self._playLock) {
          let num = 0;
          // tslint:disable-next-line:prefer-for-of
          for (let i = 0; i < self._sounds.length; i ++) {
            if (self._sounds[i]._paused && !self._sounds[i]._ended) {
              num ++;
              id = self._sounds[i]._id;
            }
          }

          if (num === 1) {
            sprite = null;
          } else {
            id = null;
          }
        }
      }

      // Get the selected node, or get one from the pool.
      const sound = id ? self._soundById(id) : self._inactiveSound();

      // If the sound doesn't exist, do nothing.
      if (!sound) {
        return null;
      }

      // Select the sprite definition.
      if (id && !sprite) {
        sprite = sound._sprite || '__default';
      }

      // If the sound hasn't loaded, we must wait to get the audio's duration.
      // We also need to wait to make sure we don't run into race conditions with
      // the order of function calls.
      if (self._state !== 'loaded') {
        // Set the sprite value on this sound.
        sound._sprite = sprite;

        // Mark this sound as not ended in case another sound is played before this one loads.
        sound._ended = false;

        // Add the sound to the queue to be played on load.
        const soundId = sound._id;
        self._queue.push({
          event: 'play',
          action: () => {
            self.play(soundId);
          }
        });

        return soundId;
      }

      // Don't play the sound if an id was passed and it is already playing.
      if (id && !sound._paused) {
        // Trigger the play event, in order to keep iterating through queue.
        if (!internal) {
          self._loadQueue('play');
        }

        return sound._id;
      }

      // Make sure the AudioContext isn't suspended, and resume it if it is.
      if (self._webAudio) {
        Howler._autoResume();
      }

      // Determine how long to play for and where to start playing.
      const seek = Math.max(0, sound._seek > 0 ? sound._seek : self._sprite[sprite][0] / 1000);
      const duration = Math.max(0, ((self._sprite[sprite][0] + self._sprite[sprite][1]) / 1000) - seek);
      const timeout = (duration * 1000) / Math.abs(sound._rate);
      const start = self._sprite[sprite][0] / 1000;
      const stop = (self._sprite[sprite][0] + self._sprite[sprite][1]) / 1000;
      sound._sprite = sprite;

      // Mark the sound as ended instantly so that this async playback
      // doesn't get grabbed by another call to play while this one waits to start.
      sound._ended = false;

      // Update the parameters of the sound.
      const setParams = () => {
        sound._paused = false;
        sound._seek = seek;
        sound._start = start;
        sound._stop = stop;
        sound._loop = !!(sound._loop || self._sprite[sprite][2]);
      };

      // End the sound instantly if seek is at the end.
      if (seek >= stop) {
        self._ended(sound);
        return;
      }

      // Begin the actual playback.
      const node = sound._node;
      if (self._webAudio) {
        // Fire this when the sound is ready to play to begin Web Audio playback.
        const playWebAudio = () => {
          self._playLock = false;
          setParams();
          self._refreshBuffer(sound);

          // Setup the playback params.
          const vol = (sound._muted || self._muted) ? 0 : sound._volume;
          node.gain.setValueAtTime(vol, Howler.ctx.currentTime);
          sound._playStart = Howler.ctx.currentTime;

          // Play the sound using the supported method.
          if (typeof node.bufferSource.start === 'undefined') {
            sound._loop ? node.bufferSource.noteGrainOn(0, seek, 86400) : node.bufferSource.noteGrainOn(0, seek, duration);
          } else {
            sound._loop ? node.bufferSource.start(0, seek, 86400) : node.bufferSource.start(0, seek, duration);
          }

          // Start a new timer if none is present.
          if (timeout !== Infinity) {
            self._endTimers[sound._id] = setTimeout(self._ended.bind(self, sound), timeout);
          }

          if (!internal) {
            setTimeout(() => {
              self._emit('play', sound._id);
              self._loadQueue();
            }, 0);
          }
        };

        if (Howler.state === 'running' && Howler.ctx.state !== 'interrupted') {
          playWebAudio();
        } else {
          self._playLock = true;

          // Wait for the audio context to resume before playing.
          self.once('resume', playWebAudio);

          // Cancel the end timer.
          self._clearTimer(sound._id);
        }
      } else {
        // Fire this when the sound is ready to play to begin HTML5 Audio playback.
        const playHtml5 = () => {
          node.currentTime = seek;
          node.muted = sound._muted || self._muted || Howler._muted || node.muted;
          node.volume = sound._volume * Howler.volume();
          node.playbackRate = sound._rate;

          // Some browsers will throw an error if this is called without user interaction.
          try {
            const play = node.play();

            // Support older browsers that don't support promises, and thus don't have this issue.
            if (play && typeof Promise !== 'undefined' && (play instanceof Promise || typeof play.then === 'function')) {
              // Implements a lock to prevent DOMException: The play() request was interrupted by a call to pause().
              self._playLock = true;

              // Set param values immediately.
              setParams();

              // Releases the lock and executes queued actions.
              play
                .then(() => {
                  self._playLock = false;
                  node._unlocked = true;
                  if (!internal) {
                    self._emit('play', sound._id);
                    self._loadQueue();
                  }
                })
                .catch(() => {
                  self._playLock = false;
                  self._emit('playerror', sound._id, 'Playback was unable to start. This is most commonly an issue ' +
                    'on mobile devices and Chrome where playback was not within a user interaction.');

                  // Reset the ended and paused values.
                  sound._ended = true;
                  sound._paused = true;
                });
            } else if (!internal) {
              self._playLock = false;
              setParams();
              self._emit('play', sound._id);
              self._loadQueue();
            }

            // Setting rate before playing won't work in IE, so we set it again here.
            node.playbackRate = sound._rate;

            // If the node is still paused, then we can assume there was a playback issue.
            if (node.paused) {
              self._emit('playerror', sound._id, 'Playback was unable to start. This is most commonly an issue ' +
                'on mobile devices and Chrome where playback was not within a user interaction.');
              return;
            }

            // Setup the end timer on sprites or listen for the ended event.
            if (sprite !== '__default' || sound._loop) {
              self._endTimers[sound._id] = setTimeout(self._ended.bind(self, sound), timeout);
            } else {
              self._endTimers[sound._id] = () => {
                // Fire ended on this audio node.
                self._ended(sound);

                // Clear this listener.
                node.removeEventListener('ended', self._endTimers[sound._id], false);
              };
              node.addEventListener('ended', self._endTimers[sound._id], false);
            }
          } catch (err) {
            self._emit('playerror', sound._id, err);
          }
        };

        // If this is streaming audio, make sure the src is set and load again.
        if (node.src === 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA') {
          node.src = self._src;
          node.load();
        }

        // Play immediately if ready, or wait for the 'canplaythrough'e vent.
        const loadedNoReadyState = (windowObject && windowObject.ejecta) || (!node.readyState && Howler._navigator.isCocoonJS);
        if (node.readyState >= 3 || loadedNoReadyState) {
          playHtml5();
        } else {
          self._playLock = true;

          const listener = () => {
            // Begin playback.
            playHtml5();

            // Clear this listener.
            node.removeEventListener(Howler._canPlayEvent, listener, false);
          };
          node.addEventListener(Howler._canPlayEvent, listener, false);

          // Cancel the end timer.
          self._clearTimer(sound._id);
        }
      }

      return sound._id;
    },

    /**
     * Pause playback and save current position.
     * @param id The sound ID (empty to pause all in group).
     * @return {Howl} return self
     */
    public pause(id) {
      const self = this;

      // If the sound hasn't loaded or a play() promise is pending, add it to the load queue to pause when capable.
      if (self._state !== 'loaded' || self._playLock) {
        self._queue.push({
          event: 'pause',
          action: () => {
            self.pause(id);
          }
        });

        return self;
      }

      // If no id is passed, get all ID's to be paused.
      const ids = self._getSoundIds(id);

      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < ids.length; i++) {
        // Clear the end timer.
        self._clearTimer(ids[i]);

        // Get the sound.
        const sound = self._soundById(ids[i]);

        if (sound && !sound._paused) {
          // Reset the seek position.
          sound._seek = self.seek(ids[i]);
          sound._rateSeek = 0;
          sound._paused = true;

          // Stop currently running fades.
          self._stopFade(ids[i]);

          if (sound._node) {
            if (self._webAudio) {
              // Make sure the sound has been created.
              if (!sound._node.bufferSource) {
                continue;
              }

              if (typeof sound._node.bufferSource.stop === 'undefined') {
                sound._node.bufferSource.noteOff(0);
              } else {
                sound._node.bufferSource.stop(0);
              }

              // Clean up the buffer source.
              self._cleanBuffer(sound._node);
            } else if (!isNaN(sound._node.duration) || sound._node.duration === Infinity) {
              sound._node.pause();
            }
          }
        }

        // Fire the pause event, unless `true` is passed as the 2nd argument.
        if (!arguments[1]) {
          self._emit('pause', sound ? sound._id : null);
        }
      }

      return self;
    },

    /**
     * Stop playback and reset to start.
     * @param  id The sound ID (empty to stop all in group).
     * @param  internal Internal Use: true prevents event firing.
     * @return {Howl} return self
     */
    public stop(id, internal) {
      const self = this;

      // If the sound hasn't loaded, add it to the load queue to stop when capable.
      if (self._state !== 'loaded' || self._playLock) {
        self._queue.push({
          event: 'stop',
          action: () => {
            self.stop(id);
          }
        });

        return self;
      }

      // If no id is passed, get all ID's to be stopped.
      const ids = self._getSoundIds(id);

      // tslint:disable-next-line:prefer-for-of
      for (let i = 0; i < ids.length; i++) {
        // Clear the end timer.
        self._clearTimer(ids[i]);

        // Get the sound.
        const sound = self._soundById(ids[i]);

        if (sound) {
          // Reset the seek position.
          sound._seek = sound._start || 0;
          sound._rateSeek = 0;
          sound._paused = true;
          sound._ended = true;

          // Stop currently running fades.
          self._stopFade(ids[i]);

          if (sound._node) {
            if (self._webAudio) {
              // Make sure the sound's AudioBufferSourceNode has been created.
              if (sound._node.bufferSource) {
                if (typeof sound._node.bufferSource.stop === 'undefined') {
                  sound._node.bufferSource.noteOff(0);
                } else {
                  sound._node.bufferSource.stop(0);
                }

                // Clean up the buffer source.
                self._cleanBuffer(sound._node);
              }
            } else if (!isNaN(sound._node.duration) || sound._node.duration === Infinity) {
              sound._node.currentTime = sound._start || 0;
              sound._node.pause();

              // If this is a live stream, stop download once the audio is stopped.
              if (sound._node.duration === Infinity) {
                self._clearSound(sound._node);
              }
            }
          }

          if (!internal) {
            self._emit('stop', sound._id);
          }
        }
      }

      return self;
    },

    /**
     * Mute/unmute a single sound or all sounds in this Howl group.
     * @param  muted Set to true to mute and false to unmute.
     * @param  id    The sound ID to update (omit to mute/unmute all).
     * @return {Howl} return self
     */
    public mute(muted, id) {
      const self = this;

      // If the sound hasn't loaded, add it to the load queue to mute when capable.
      if (self._state !== 'loaded' || self._playLock) {
        self._queue.push({
          event: 'mute',
          action: () => {
            self.mute(muted, id);
          }
        });

        return self;
      }

      // If applying mute/unmute to all sounds, update the group's value.
      if (typeof id === 'undefined') {
        if (typeof muted === 'boolean') {
          self._muted = muted;
        } else {
          return self._muted;
        }
      }

      // If no id is passed, get all ID's to be muted.
      const ids = self._getSoundIds(id);

      for (const sound of ids) {
        // Get the sound.

        if (sound) {
          sound._muted = muted;

          // Cancel active fade and set the volume to the end value.
          if (sound._interval) {
            self._stopFade(sound._id);
          }

          if (self._webAudio && sound._node) {
            sound._node.gain.setValueAtTime(muted ? 0 : sound._volume, Howler.ctx.currentTime);
          } else if (sound._node) {
            sound._node.muted = Howler._muted ? true : muted;
          }

          self._emit('mute', sound._id);
        }
      }

      return self;
    },

    /**
     * Get/set the volume of this sound or of the Howl group. This method can optionally take 0, 1 or 2 arguments.
     *   volume() -> Returns the group's volume value.
     *   volume(id) -> Returns the sound id's current volume.
     *   volume(vol) -> Sets the volume of all sounds in this Howl group.
     *   volume(vol, id) -> Sets the volume of passed sound id.
     * @return Returns self or current volume.
     */
    public volume() {
      const self = this;
      const args = arguments;
      let vol;
      let id;

      // Determine the values based on arguments.
      if (args.length === 0) {
        // Return the value of the groups' volume.
        return self._volume;
      } else if (args.length === 1 || args.length === 2 && typeof args[1] === 'undefined') {
        // First check if this is an ID, and if not, assume it is a new volume.
        const ids = self._getSoundIds();
        const index = ids.indexOf(args[0]);
        if (index >= 0) {
          id = parseInt(args[0], 10);
        } else {
          vol = parseFloat(args[0]);
        }
      } else if (args.length >= 2) {
        vol = parseFloat(args[0]);
        id = parseInt(args[1], 10);
      }

      // Update the volume or return the current volume.
      let sound;
      if (typeof vol !== 'undefined' && vol >= 0 && vol <= 1) {
        // If the sound hasn't loaded, add it to the load queue to change volume when capable.
        if (self._state !== 'loaded' || self._playLock) {
          self._queue.push({
            event: 'volume',
            action: () => {
              self.volume.apply(self, args);
            }
          });

          return self;
        }

        // Set the group volume.
        if (typeof id === 'undefined') {
          self._volume = vol;
        }

        // Update one or all volumes.
        for (const index of self._getSoundIds(id)) {
          // Get the sound.
          sound = self._soundById(index);

          if (sound) {
            sound._volume = vol;

            // Stop currently running fades.
            if (!args[2]) {
              self._stopFade(index);
            }

            if (self._webAudio && sound._node && !sound._muted) {
              sound._node.gain.setValueAtTime(vol, Howler.ctx.currentTime);
            } else if (sound._node && !sound._muted) {
              sound._node.volume = vol * Howler.volume();
            }

            self._emit('volume', sound._id);
          }
        }
      } else {
        sound = id ? self._soundById(id) : self._sounds[0];
        return sound ? sound._volume : 0;
      }

      return self;
    },

    /**
     * Fade a currently playing sound between two volumes (if no id is passed, all sounds will fade).
     * @param  from The value to fade from (0.0 to 1.0).
     * @param  to   The volume to fade to (0.0 to 1.0).
     * @param  len  Time in milliseconds to fade.
     * @param  id   The sound id (omit to fade all sounds).
     * @return {Howl} return self
     */
    public fade(from, to, len, id) {
      const self = this;

      // If the sound hasn't loaded, add it to the load queue to fade when capable.
      if (self._state !== 'loaded' || self._playLock) {
        self._queue.push({
          event: 'fade',
          action: () => {
            self.fade(from, to, len, id);
          }
        });

        return self;
      }

      // Make sure the to/from/len values are numbers.
      from = Math.min(Math.max(0, parseFloat(from)), 1);
      to = Math.min(Math.max(0, parseFloat(to)), 1);
      len = parseFloat(len);

      // Set the volume to the start position.
      self.volume(from, id);

      // Fade the volume of one or all sounds.
      for (const index of self._getSoundIds(id)) {
        // Get the sound.
        const sound = self._soundById(index);

        // Create a linear fade or fall back to timeouts with HTML5 Audio.
        if (sound) {
          // Stop the previous fade if no sprite is being used (otherwise, volume handles this).
          if (!id) {
            self._stopFade(index);
          }

          // If we are using Web Audio, let the native methods do the actual fade.
          if (self._webAudio && !sound._muted) {
            const currentTime = Howler.ctx.currentTime;
            const end = currentTime + (len / 1000);
            sound._volume = from;
            sound._node.gain.setValueAtTime(from, currentTime);
            sound._node.gain.linearRampToValueAtTime(to, end);
          }

          self._startFadeInterval(sound, from, to, len, index, typeof id === 'undefined');
        }
      }

      return self;
    },

    /**
     * Starts the internal interval to fade a sound.
     * @param  sound Reference to sound to fade.
     * @param  from The value to fade from (0.0 to 1.0).
     * @param  to   The volume to fade to (0.0 to 1.0).
     * @param  len  Time in milliseconds to fade.
     * @param  id   The sound id to fade.
     * @param  isGroup   If true, set the volume on the group.
     */
    public _startFadeInterval(sound, from, to, len, id, isGroup) {
      const self = this;
      let vol = from;
      const diff = to - from;
      const steps = Math.abs(diff / 0.01);
      const stepLen = Math.max(4, (steps > 0) ? len / steps : len);
      let lastTick = Date.now();

      // Store the value being faded to.
      sound._fadeTo = to;

      // Update the volume value on each interval tick.
      sound._interval = setInterval(() => {
        // Update the volume based on the time since the last tick.
        const tick = (Date.now() - lastTick) / len;
        lastTick = Date.now();
        vol += diff * tick;

        // Make sure the volume is in the right bounds.
        if (diff < 0) {
          vol = Math.max(to, vol);
        } else {
          vol = Math.min(to, vol);
        }

        // Round to within 2 decimal points.
        vol = Math.round(vol * 100) / 100;

        // Change the volume.
        if (self._webAudio) {
          sound._volume = vol;
        } else {
          self.volume(vol, sound._id, true);
        }

        // Set the group's volume.
        if (isGroup) {
          self._volume = vol;
        }

        // When the fade is complete, stop it and fire event.
        if ((to < from && vol <= to) || (to > from && vol >= to)) {
          clearInterval(sound._interval);
          sound._interval = null;
          sound._fadeTo = null;
          self.volume(to, sound._id);
          self._emit('fade', sound._id);
        }
      }, stepLen);
    },

    /**
     * Internal method that stops the currently playing fade when
     * a new fade starts, volume is changed or the sound is stopped.
     * @param id The sound id.
     * @return {Howl} return self
     */
    public _stopFade(id) {
      const self = this;
      const sound = self._soundById(id);

      if (sound && sound._interval) {
        if (self._webAudio) {
          sound._node.gain.cancelScheduledValues(Howler.ctx.currentTime);
        }

        clearInterval(sound._interval);
        sound._interval = null;
        self.volume(sound._fadeTo, id);
        sound._fadeTo = null;
        self._emit('fade', id);
      }

      return self;
    },

    /**
     * Get/set the loop parameter on a sound. This method can optionally take 0, 1 or 2 arguments.
     *   loop() -> Returns the group's loop value.
     *   loop(id) -> Returns the sound id's loop value.
     *   loop(loop) -> Sets the loop value for all sounds in this Howl group.
     *   loop(loop, id) -> Sets the loop value of passed sound id.
     * @return {Howl/Boolean} Returns self or current loop value.
     */
    public loop() {
      const self = this;
      const args = arguments;
      let loop;
      let id;
      let sound;

      // Determine the values for loop and id.
      if (args.length === 0) {
        // Return the grou's loop value.
        return self._loop;
      } else if (args.length === 1) {
        if (typeof args[0] === 'boolean') {
          loop = args[0];
          self._loop = loop;
        } else {
          // Return this sound's loop value.
          sound = self._soundById(parseInt(args[0], 10));
          return sound ? sound._loop : false;
        }
      } else if (args.length === 2) {
        loop = args[0];
        id = parseInt(args[1], 10);
      }

      // If no id is passed, get all ID's to be looped.
      for (const index of self._getSoundIds(id)) {
        sound = self._soundById(index);

        if (sound) {
          sound._loop = loop;
          if (self._webAudio && sound._node && sound._node.bufferSource) {
            sound._node.bufferSource.loop = loop;
            if (loop) {
              sound._node.bufferSource.loopStart = sound._start || 0;
              sound._node.bufferSource.loopEnd = sound._stop;
            }
          }
        }
      }

      return self;
    },

    /**
     * Get/set the playback rate of a sound. This method can optionally take 0, 1 or 2 arguments.
     *   rate() -> Returns the first sound node's current playback rate.
     *   rate(id) -> Returns the sound id's current playback rate.
     *   rate(rate) -> Sets the playback rate of all sounds in this Howl group.
     *   rate(rate, id) -> Sets the playback rate of passed sound id.
     * @return {Howl/Number} Returns self or the current playback rate.
     */
    public rate() {
      const self = this;
      const args = arguments;
      let rate;
      let id;

      // Determine the values based on arguments.
      if (args.length === 0) {
        // We will simply return the current rate of the first node.
        id = self._sounds[0]._id;
      } else if (args.length === 1) {
        // First check if this is an ID, and if not, assume it is a new rate value.
        const ids = self._getSoundIds();
        const index = ids.indexOf(args[0]);
        if (index >= 0) {
          id = parseInt(args[0], 10);
        } else {
          rate = parseFloat(args[0]);
        }
      } else if (args.length === 2) {
        rate = parseFloat(args[0]);
        id = parseInt(args[1], 10);
      }

      // Update the playback rate or return the current value.
      let sound;
      if (typeof rate === 'number') {
        // If the sound hasn't loaded, add it to the load queue to change playback rate when capable.
        if (self._state !== 'loaded' || self._playLock) {
          self._queue.push({
            event: 'rate',
            action: () => {
              self.rate.apply(self, args);
            }
          });

          return self;
        }

        // Set the group rate.
        if (typeof id === 'undefined') {
          self._rate = rate;
        }

        // Update one or all volumes.
        for (const index of self._getSoundIds(id)) {
          // Get the sound.
          sound = self._soundById(index);

          if (sound) {
            // Keep track of our position when the rate changed and update the playback
            // start position so we can properly adjust the seek position for time elapsed.
            if (self.playing(index)) {
              sound._rateSeek = self.seek(index);
              sound._playStart = self._webAudio ? Howler.ctx.currentTime : sound._playStart;
            }
            sound._rate = rate;

            // Change the playback rate.
            if (self._webAudio && sound._node && sound._node.bufferSource) {
              sound._node.bufferSource.playbackRate.setValueAtTime(rate, Howler.ctx.currentTime);
            } else if (sound._node) {
              sound._node.playbackRate = rate;
            }

            // Reset the timers.
            const seek = self.seek(index);
            const duration = ((self._sprite[sound._sprite][0] + self._sprite[sound._sprite][1]) / 1000) - seek;
            const timeout = (duration * 1000) / Math.abs(sound._rate);

            // Start a new end timer if sound is already playing.
            if (self._endTimers[index] || !sound._paused) {
              self._clearTimer(index);
              self._endTimers[index] = setTimeout(self._ended.bind(self, sound), timeout);
            }

            self._emit('rate', sound._id);
          }
        }
      } else {
        sound = self._soundById(id);
        return sound ? sound._rate : self._rate;
      }

      return self;
    },

    /**
     * Get/set the seek position of a sound. This method can optionally take 0, 1 or 2 arguments.
     *   seek() -> Returns the first sound node's current seek position.
     *   seek(id) -> Returns the sound id's current seek position.
     *   seek(seek) -> Sets the seek position of the first sound node.
     *   seek(seek, id) -> Sets the seek position of passed sound id.
     * @return {Howl/Number} Returns self or the current seek position.
     */
    public seek() {
      const self = this;
      const args = arguments;
      let seek;
      let id;

      // Determine the values based on arguments.
      if (args.length === 0) {
        // We will simply return the current position of the first node.
        id = self._sounds[0]._id;
      } else if (args.length === 1) {
        // First check if this is an ID, and if not, assume it is a new seek position.
        const ids = self._getSoundIds();
        const index = ids.indexOf(args[0]);
        if (index >= 0) {
          id = parseInt(args[0], 10);
        } else if (self._sounds.length) {
          id = self._sounds[0]._id;
          seek = parseFloat(args[0]);
        }
      } else if (args.length === 2) {
        seek = parseFloat(args[0]);
        id = parseInt(args[1], 10);
      }

      // If there is no ID, bail out.
      if (typeof id === 'undefined') {
        return self;
      }

      // If the sound hasn't loaded, add it to the load queue to seek when capable.
      if (self._state !== 'loaded' || self._playLock) {
        self._queue.push({
          event: 'seek',
          action: () => {
            self.seek.apply(self, args);
          }
        });

        return self;
      }

      // Get the sound.
      const sound = self._soundById(id);

      if (sound) {
        if (typeof seek === 'number' && seek >= 0) {
          // Pause the sound and update position for restarting playback.
          const playing = self.playing(id);
          if (playing) {
            self.pause(id, true);
          }

          // Move the position of the track and cancel timer.
          sound._seek = seek;
          sound._ended = false;
          self._clearTimer(id);

          // Update the seek position for HTML5 Audio.
          if (!self._webAudio && sound._node && !isNaN(sound._node.duration)) {
            sound._node.currentTime = seek;
          }

          // Seek and emit when ready.
          const seekAndEmit = () => {
            self._emit('seek', id);

            // Restart the playback if the sound was playing.
            if (playing) {
              self.play(id, true);
            }
          };

          // Wait for the play lock to be unset before emitting (HTML5 Audio).
          if (playing && !self._webAudio) {
            const emitSeek = () => {
              if (!self._playLock) {
                seekAndEmit();
              } else {
                setTimeout(emitSeek, 0);
              }
            };
            setTimeout(emitSeek, 0);
          } else {
            seekAndEmit();
          }
        } else {
          if (self._webAudio) {
            const realTime = self.playing(id) ? Howler.ctx.currentTime - sound._playStart : 0;
            const rateSeek = sound._rateSeek ? sound._rateSeek - sound._seek : 0;
            return sound._seek + (rateSeek + realTime * Math.abs(sound._rate));
          } else {
            return sound._node.currentTime;
          }
        }
      }

      return self;
    },

    /**
     * Check if a specific sound is currently playing or not (if id is
     * provided), or check if at least one of the sounds in the group is
     * playing or not.
     * @param  {Number}  id The sound id to check. If none is passed, the whole sound group is checked.
     * @return {Boolean} True if playing and false if not.
     */
    public playing(id) {
      const self = this;

      // Check the passed sound ID (if any).
      if (typeof id === 'number') {
        const sound = self._soundById(id);
        return sound ? !sound._paused : false;
      }

      // Otherwise, loop through all sounds and check if any are playing.
      for (const sound of self._sounds) {
        if (! sound._paused) {
          return true;
        }
      }

      return false;
    },

    /**
     * Get the duration of this sound. Passing a sound id will return the sprite duration.
     * @param  id The sound id to check. If none is passed, return full source duration.
     * @return Audio duration in seconds.
     */
    public duration(id): number {
      const self = this;
      let duration = self._duration;

      // If we pass an ID, get the sound and return the sprite length.
      const sound = self._soundById(id);
      if (sound) {
        duration = self._sprite[sound._sprite][1] / 1000;
      }

      return duration;
    },

    /**
     * Returns the current loaded state of this Howl.
     * @return 'unloaded', 'loading', 'loaded'
     */
    public state(): string {
      return this._state;
    },

    /**
     * Unload and destroy the current Howl object.
     * This will immediately stop all sound instances attached to this group.
     */
    public unload() {
      let self = this;

      // Stop playing any active sounds.
      for (const sound of self._sounds) {
        // Stop the sound if it is currently playing.
        if (!sound._paused) {
          self.stop(sound._id);
        }

        // Remove the source or disconnect.
        if (!self._webAudio) {
          // Set the source to 0-second silence to stop any downloading (except in IE).
          self._clearSound(sound._node);

          // Remove any event listeners.
          sound._node.removeEventListener('error', sound._errorFn, false);
          sound._node.removeEventListener(Howler._canPlayEvent, sound._loadFn, false);

          // Release the Audio object back to the pool.
          Howler._releaseHtml5Audio(sound._node);
        }

        // Empty out all of the nodes.
        delete sound._node;

        // Make sure all timers are cleared out.
        self._clearTimer(sound._id);
      }

      // Remove the references in the global Howler object.
      const index = Howler._howls.indexOf(self);
      if (index >= 0) {
        Howler._howls.splice(index, 1);
      }

      // Delete this sound from the cache (if no other Howl is using it).
      let remCache = true;
      for (const howl of Howler._howls) {
        if (howl._src === self._src || self._src.indexOf(howl._src) >= 0) {
          remCache = false;
          break;
        }
      }

      if (cache && remCache) {
        delete cache[self._src];
      }

      // Clear global errors.
      Howler.noAudio = false;

      // Clear out `self`.
      self._state = 'unloaded';
      self._sounds = [];
      self = null;

      return null;
    },

    /**
     * Listen to a custom event.
     * @param  event Event name.
     * @param  fn    Listener to call.
     * @param  id    (optional) Only listen to events for this sound.
     * @param  once  (INTERNAL) Marks event to fire only once.
     * @return {Howl} return self
     */
    // tslint:disable-next-line:ban-types
    public on(event: string, fn: Function, id: number, once: number) {
      const events = this['_on' + event];

      if (typeof fn === 'function') {
        events.push(once ? {id, fn, once} : {id, fn});
      }

      return self;
    },

    /**
     * Remove a custom event. Call without parameters to remove all events.
     * @param  event Event name.
     * @param  fn    Listener to remove. Leave empty to remove all.
     * @param  id    (optional) Only remove events for this sound.
     * @return {Howl} return self
     */
    // tslint:disable-next-line:ban-types
    public off(event: string, fn: Function = null, id: number = null) {
      const events = this['_on' + event];
      let i = 0;

      // Allow passing just an event and ID.
      if (typeof fn === 'number') {
        id = fn;
        fn = null;
      }

      if (fn || id) {
        // Loop through event store and remove the passed function.
        for (const thisEvent of events) {
          const isId = (id === thisEvent.id);
          if (fn === thisEvent.fn && isId || !fn && isId) {
            events.splice(i, 1);
            break;
          }
        }
      } else if (event) {
        // Clear out all events of this type.
        self['_on' + event] = [];
      } else {
        // Clear out all events of every type.
        const keys = Object.keys(self);
        for (i = 0; i < keys.length; i++) {
          if ((keys[i].indexOf('_on') === 0) && Array.isArray(self[keys[i]])) {
            self[keys[i]] = [];
          }
        }
      }

      return self;
    },

    /**
     * Listen to a custom event and remove it once fired.
     * @param  event Event name.
     * @param  fn    Listener to call.
     * @param  id    (optional) Only listen to events for this sound.
     * @return {Howl} return self;
     */
    // tslint:disable-next-line:ban-types
    public once(event: string, fn: Function, id: number = null) {
      var self = this;

      // Setup the event listener.
      self.on(event, fn, id, 1);

      return self;
    },

    /**
     * Emit all events of a specific type and pass the sound id.
     * @param  event Event name.
     * @param  id    Sound ID.
     * @param  msg   Message to go with event.
     * @return {Howl} return self
     */
    public _emit(event: string, id: number, msg: number) {
      const events = this['_on' + event];

      // Loop through event store and fire all functions.
      for (const thisEvent of events) {
        // Only fire the listener if the correct ID is used.
        if (!thisEvent.id || thisEvent.id === id || event === 'load') {
          setTimeout(function(fn) {
            fn.call(this, id, msg);
          }.bind(self, thisEvent.fn), 0);

          // If this event was setup with `once`, remove it.
          if (events[i].once) {
            this.off(event, thisEvent.fn, thisEvent.id);
          }
        }
      }

      // Pass the event type into load queue so that it can continue stepping.
      this._loadQueue(event);

      return this;
    },

    /**
     * Queue of actions initiated before the sound has loaded.
     * These will be called in sequence, with the next only firing
     * after the previous has finished executing (even if async like play).
     * @return {Howl} return self
     */
    public _loadQueue(event) {

      if (this._queue.length > 0) {
        const task = this._queue[0];

        // Remove this task if a matching event was passed.
        if (task.event === event) {
          this._queue.shift();
          this._loadQueue();
        }

        // Run the task if no event type is passed.
        if (!event) {
          task.action();
        }
      }

      return self;
    },

    /**
     * Fired when playback ends at the end of the duration.
     * @param  {Sound} sound The sound object to work with.
     * @return {Howl}
     */
    public _ended(sound: Sound) {
      const sprite = sound._sprite;

      // If we are using IE and there was network latency we may be clipping
      // audio before it completes playing. Lets check the node to make sure it
      // believes it has completed, before ending the playback.
      if (!this._webAudio && sound._node && !sound._node.paused && !sound._node.ended && sound._node.currentTime < sound._stop) {
        setTimeout(this._ended.bind(self, sound), 100);
        return self;
      }

      // Should this sound loop?
      const loop = !!(sound._loop || this._sprite[sprite][2]);

      // Fire the ended event.
      this._emit('end', sound._id);

      // Restart the playback for HTML5 Audio loop.
      if (!this._webAudio && loop) {
        this.stop(sound._id, true).play(sound._id);
      }

      // Restart this timer if on a Web Audio loop.
      if (this._webAudio && loop) {
        this._emit('play', sound._id);
        sound._seek = sound._start || 0;
        sound._rateSeek = 0;
        sound._playStart = Howler.ctx.currentTime;

        const timeout = ((sound._stop - sound._start) * 1000) / Math.abs(sound._rate);
        this._endTimers[sound._id] = setTimeout(this._ended.bind(self, sound), timeout);
      }

      // Mark the node as paused.
      if (this._webAudio && !loop) {
        sound._paused = true;
        sound._ended = true;
        sound._seek = sound._start || 0;
        sound._rateSeek = 0;
        this._clearTimer(sound._id);

        // Clean up the buffer source.
        this._cleanBuffer(sound._node);

        // Attempt to auto-suspend AudioContext if no sounds are still playing.
        Howler._autoSuspend();
      }

      // When using a sprite, end the track.
      if (!this._webAudio && !loop) {
        this.stop(sound._id, true);
      }

      return this;
    },

    /**
     * Clear the end timer for a sound playback.
     * @param  id The sound ID.
     * @return {Howl} return self
     */
    public _clearTimer(id: number) {
      if (this._endTimers[id]) {
        // Clear the timeout or remove the ended listener.
        if (typeof this._endTimers[id] !== 'function') {
          clearTimeout(this._endTimers[id]);
        } else {
          const sound = self._soundById(id);
          if (sound && sound._node) {
            sound._node.removeEventListener('ended', this._endTimers[id], false);
          }
        }

        delete this._endTimers[id];
      }

      return this;
    },

    /**
     * Return the sound identified by this ID, or return null.
     * @param  id Sound ID
     * @return Sound object or null.
     */
    public _soundById(id: number): Sound | null {
      // Loop through all sounds and find the one with this ID.
      let foundSound = null;

      this._sounds.forEach((sound, index) => {
        if (index === id) {
          foundSound = sound;
        }
      });

      return foundSound;
    },

    /**
     * Return an inactive sound from the pool or create a new one.
     * @return Sound playback object.
     */
    public _inactiveSound(): Sound {
      this._drain();

      // Find the first inactive node to recycle.
      let foundReset = false;
      let foundSound: Sound = null;
      this._sounds.forEach(sound => {
        if (sound._ended && ! foundReset) {
          foundReset = true;
          foundSound = sound.reset();
        }
      });

      if (foundReset) {
        return foundSound;
      } else {
        // If no inactive node was found, create a new one.
        return new Sound(self);
      }
    },

    /**
     * Drain excess inactive sounds from the pool.
     */
    public _drain() {
      const limit = this._pool;
      let count = 0;
      let i = 0;

      // If there are less sounds than the max pool size, we are done.
      if (this._sounds.length < limit) {
        return;
      }

      // Count the number of inactive sounds.
      this._sounds.forEach(sound => {
        if (sound._ended) {
          count ++;
        }
      });

      // Remove excess inactive sounds, going in reverse order.
      for (i = this._sounds.length - 1; i >= 0; i--) {
        if (count <= limit) {
          return;
        }

        if (this._sounds[i]._ended) {
          // Disconnect the audio source when using Web Audio.
          if (this._webAudio && this._sounds[i]._node) {
            this._sounds[i]._node.disconnect(0);
          }

          // Remove sounds until we have the pool size.
          this._sounds.splice(i, 1);
          count --;
        }
      }
    },

    /**
     * Get all ID's from the sounds pool.
     * @param id Only return one ID if one is passed.
     * @return Array of IDs.
     */
    public _getSoundIds(id: number = null): number[] {
      if (id) {
        const ids = [];

        this._sounds.forEach(sound => {
          ids.push(sound._id);
        });

        return ids;
      } else {
        return [id];
      }
    },

    /**
     * Load the sound back into the buffer source.
     * @param sound The sound object to work with.
     * @return {Howl} return self
     */
    public _refreshBuffer(sound: Sound) {
      // Setup the buffer source for playback.
      sound._node.bufferSource = Howler.ctx.createBufferSource();
      sound._node.bufferSource.buffer = cache[this._src];

      // Connect to the correct node.
      if (sound._panner) {
        sound._node.bufferSource.connect(sound._panner);
      } else {
        sound._node.bufferSource.connect(sound._node);
      }

      // Setup looping and playback rate.
      sound._node.bufferSource.loop = sound._loop;
      if (sound._loop) {
        sound._node.bufferSource.loopStart = sound._start || 0;
        sound._node.bufferSource.loopEnd = sound._stop || 0;
      }
      sound._node.bufferSource.playbackRate.setValueAtTime(sound._rate, Howler.ctx.currentTime);

      return this;
    },

    /**
     * Prevent memory leaks by cleaning up the buffer source after playback.
     * @param  node Sound's audio node containing the buffer source.
     * @return {Howl} return self
     */
    public _cleanBuffer(node: any) {
      const isIOS = Howler._navigator && Howler._navigator.vendor.indexOf('Apple') >= 0;

      if (Howler._scratchBuffer && node.bufferSource) {
        node.bufferSource.onended = null;
        node.bufferSource.disconnect(0);
        if (isIOS) {
          try { node.bufferSource.buffer = Howler._scratchBuffer;
          } catch (e) {

          }
        }
      }
      node.bufferSource = null;

      return this;
    },

    /**
     * Set the source to a 0-second silence to stop any downloading (except in IE).
     * @param node Audio node to clear.
     */
    public _clearSound(node: any) {
      const checkIE = /MSIE |Trident\//.test(Howler._navigator && Howler._navigator.userAgent);
      if (!checkIE) {
        node.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      }
    }
  };
