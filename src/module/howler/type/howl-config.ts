import { SoundFile } from './sound-file';
import { Xhr } from './xhr';
import { EventListeners } from './event-listeners';

// tslint:disable:variable-name
export class HowlConfig {
  private _autoplay = false;
  private _format: any;
  private _html5 = false;
  private _muted = false;
  private _loop = false;
  private _pool = 5;
  private _preload = true;
  private _rate = 1;
  private _sprite: any;
  private _soundFileArray: SoundFile[];
  private _volume = 1;
  private _xhr: Xhr;
  private _eventListeners: EventListeners;

  public constructor(config: object = null) {
    this.exchangeObject(config);
  }

  get autoplay(): boolean {
    return this._autoplay;
  }

  set autoplay(value: boolean) {
    this._autoplay = value;
  }

  get format(): string {
    return this._format;
  }

  set format(value: string) {
    this._format = value;
  }

  get html5(): boolean {
    return this._html5;
  }

  set html5(value: boolean) {
    this._html5 = value;
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
  }

  get loop(): boolean {
    return this._loop;
  }

  set loop(value: boolean) {
    this._loop = value;
  }

  get pool(): number {
    return this._pool;
  }

  set pool(value: number) {
    this._pool = value;
  }

  get preload(): boolean {
    return this._preload;
  }

  set preload(value: boolean) {
    this._preload = value;
  }

  get rate(): number {
    return this._rate;
  }

  set rate(value: number) {
    this._rate = value;
  }

  get sprite(): any {
    return this._sprite;
  }

  set sprite(value: any) {
    this._sprite = value;
  }

  get soundFileArray(): SoundFile[] {
    return this._soundFileArray;
  }

  set soundFileArray(value: SoundFile[]) {
    this._soundFileArray = value;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = value;
  }

  get xhr(): Xhr {
    return this._xhr;
  }

  set xhr(value: Xhr) {
    this._xhr = value;
  }

  get eventListeners(): EventListeners {
    return this._eventListeners;
  }

  set eventListeners(value: EventListeners) {
    this._eventListeners = value;
  }

  public getObjectCopy(): object {
    return {
      autoplay: this.autoplay,
      format: this.format,
      html5: this.html5,
      muted: this.muted,
      loop: this.loop,
      pool: this.pool,
      preload: this.preload,
      rate: this.rate,
      sprite: this.sprite,
      soundFileArray: this.soundFileArray,
      volume: this.volume,
      xhr: this.xhr,
      eventListeners: this.eventListeners
    };
  }

  public exchangeObject(object: any): this {
    for (const [key, value] of Object.entries(object)) {
      switch (key) {
        case 'autoplay':
          this.autoplay = value as boolean;
          break;
        case 'format':
          this.format = value as any;
          break;
        case 'html5':
          this.html5 = value as boolean;
          break;
        case 'muted':
          this.muted = value as boolean;
          break;
        case 'loop':
          this.loop = value as boolean;
          break;
        case 'pool':
          this.pool = value as number;
          break;
        case 'preload':
          this.preload = value as boolean;
          break;
        case 'rate':
          this.rate = value as number;
          break;
        case 'sprite':
          this.sprite = value as any;
          break;
        case 'soundFileArray':
          this.soundFileArray = value as SoundFile[];
          break;
        case 'volume':
          this.volume = value as number;
          break;
        case 'xhr':
          this.xhr = value as any;
          break;
        case 'eventListeners':
          this.eventListeners = value as EventListeners;
          break;
      }
    }

    return this;
  }
}
