// tslint:disable:variable-name
export class SoundConfig {
  // Setup the default parameters.
  private _muted: boolean;
  private _loop: number;
  private _volume: number;
  private _rate: number;
  private _seek: number;
  private _rateSeek: number;
  private _paused: boolean;
  private _ended: boolean;
  private _sprite = '__default';
  private _format: string;

  public constructor(config: object = null) {
    this.exchangeObject(config);
  }

  get muted(): boolean {
    return this._muted;
  }

  set muted(value: boolean) {
    this._muted = value;
  }

  get loop(): number {
    return this._loop;
  }

  set loop(value: number) {
    this._loop = value;
  }

  get volume(): number {
    return this._volume;
  }

  set volume(value: number) {
    this._volume = value;
  }
  get rate(): number {
    return this._rate;
  }

  set rate(value: number) {
    this._rate = value;
  }

  get seek(): number {
    return this._seek;
  }

  set seek(value: number) {
    this._seek = value;
  }

  get rateSeek(): number {
    return this._rateSeek;
  }

  set rateSeek(value: number) {
    this._rateSeek = value;
  }

  get paused(): boolean {
    return this._paused;
  }

  set paused(value: boolean) {
    this._paused = value;
  }

  get ended(): boolean {
    return this._ended;
  }

  set ended(value: boolean) {
    this._ended = value;
  }

  get sprite(): string {
    return this._sprite;
  }

  set sprite(value: string) {
    this._sprite = value;
  }

  get format(): string {
    return this._format;
  }

  set format(value: string) {
    this._format = value;
  }

  public getObjectCopy(): object {
    return {
      muted: this.muted,
      loop: this.loop,
      volume: this.volume,
      rate: this.rate,
      seek: this.seek,
      rateSeek: this.rateSeek,
      paused: this.paused,
      ended: this.ended,
      sprite: this.sprite,
      format: this.format
    };
  }

  public exchangeObject(object: any): SoundConfig {
    for (const [key, value] of Object.entries(object)) {
      switch (key) {
        case 'muted':
          this.muted = value as boolean;
          break;
        case 'loop':
          this.loop = value as number;
          break;
        case 'volume':
          this.volume = value as number;
          break;
        case 'rate':
          this.rate = value as number;
          break;
        case 'seek':
          this.seek = value as number;
          break;
        case 'rateSeek':
          this.rateSeek = value as number;
          break;
        case 'paused':
          this.paused = value as boolean;
          break;
        case 'ended':
          this.ended = value as boolean;
          break;
        case 'sprite':
          this.sprite = value as string;
          break;
        case 'format':
          this.format = value as string;
          break;
      }
    }

    return this;
  }
}
