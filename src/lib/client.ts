import { SerialResponse, SerializableValue } from './data/serial';
import { encodeNumberToUint8Array } from './data/encoding';
import { Commands } from '../commands';
import { Socket } from 'net';

export type ConnectionOptions = {
    host?: string,
    port?: number,
    maxKeySizeBytes?: number,
    maxValueSizeBytes?: number
}

export class Client {
    options: ConnectionOptions;

    private socket: Socket;
    private encoder: TextEncoder;

    constructor(options: ConnectionOptions = {
        host: 'localhost',
        port: 9055,
        maxKeySizeBytes: 32,
        maxValueSizeBytes: 1_024
    }) {
        this.options = options;
        this.socket = new Socket();
        this.encoder = new TextEncoder();

        if (this.options.host === undefined) this.options.host = 'localhost';
        if (this.options.port === undefined) this.options.port = 9055;
        if (this.options.maxKeySizeBytes === undefined) this.options.maxKeySizeBytes = 32;
        if (this.options.maxValueSizeBytes === undefined) this.options.maxValueSizeBytes = 1_024;
    }

    private validateKey(key: string) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (key.length > this.options.maxKeySizeBytes!) {
            throw `key '${key}' too long (> ${ this.options.maxKeySizeBytes } b)`;
        }
    }

    private validateValue(value: SerializableValue) {
        if (typeof value === 'boolean') {
            return;
        }

        if (typeof value === 'number') {
            value = value.toString();
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        if (value.length > this.options.maxValueSizeBytes!) {
            throw `value too long (> ${ this.options.maxValueSizeBytes } b)`;
        }
    }

    private serializeKey(key: string) {
        this.validateKey(key);

        const buf = new Uint8Array(key.length);

        for (let i = 0; i < key.length; i++) {
            buf[i] = key.charCodeAt(i);
        }

        return buf;
    }

    public async connect() {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        let rejectCallback: (reason?: any) => void = () => {};

        await new Promise<void>((resolve, reject) => {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.socket.connect(this.options.port!, this.options.host!, resolve);

            rejectCallback = reject;
            this.socket.once('error', rejectCallback);
        });

        this.socket.removeListener('error', rejectCallback);
    }

    public close() {

        this.socket.destroy();

    }

    public async ping() {
        this.socket.write(new Uint8Array([Commands.PING]));

        await new Promise<void>((resolve) => {
            this.socket.once('data', resolve);
        });

        return true;
    }

    public async get(key: string) {
        this.validateKey(key);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const data = new Uint8Array(1 + this.options.maxKeySizeBytes!);

        data[0] = Commands.GET;
        data.set(this.serializeKey(key), 1);

        this.socket.write(data);

        const res = await new Promise<Uint8Array>((resolve) => {
            this.socket.once('data', (data) => resolve(Uint8Array.from(data)));
        });

        return new SerialResponse(res);
    }

    public async set(key: string, value: SerializableValue) {
        this.validateKey(key);
        this.validateValue(value);

        if (typeof value === 'string') {
            value = this.encoder.encode(value);
        } else if (typeof value === 'number') {
            value = encodeNumberToUint8Array(value);
        } else if (typeof value === 'boolean') {
            value = new Uint8Array([value ? 1 : 0]);
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const data = new Uint8Array(1 + this.options.maxKeySizeBytes! + value.byteLength);

        data[0] = Commands.SET;
        data.set(this.serializeKey(key), 1);
        data.set(value, 33);

        this.socket.write(data);

        const res = await new Promise<Uint8Array>((resolve) => {
            this.socket.once('data', resolve);
        });

        return res[0] === 1;
    }

    public async exists(key: string) {
        this.validateKey(key);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const data = new Uint8Array(1 + this.options.maxKeySizeBytes!);

        data[0] = Commands.EXISTS;
        data.set(this.serializeKey(key), 1);

        this.socket.write(data);

        const res = await new Promise<Uint8Array>((resolve) => {
            this.socket.once('data', resolve);
        });

        return res[0] === 1;
    }

    public async delete(key: string) {
        this.validateKey(key);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const data = new Uint8Array(1 + this.options.maxKeySizeBytes!);

        data[0] = Commands.DELETE;
        data.set(this.serializeKey(key), 1);

        this.socket.write(data);

        const res = await new Promise<Uint8Array>((resolve) => {
            this.socket.once('data', resolve);
        });

        return res[0] === 1;
    }
}