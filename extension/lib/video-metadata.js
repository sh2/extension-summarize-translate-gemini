// Common aliases
var $Reader = protobuf.Reader, $Writer = protobuf.Writer, $util = protobuf.util;

// Exported root namespace
var $root = protobuf.roots["default"] || (protobuf.roots["default"] = {});

$root.VideoMetadata = (function() {

    /**
     * Properties of a VideoMetadata.
     * @exports IVideoMetadata
     * @interface IVideoMetadata
     * @property {string|null} [param1] VideoMetadata param1
     * @property {string|null} [param2] VideoMetadata param2
     */

    /**
     * Constructs a new VideoMetadata.
     * @exports VideoMetadata
     * @classdesc Represents a VideoMetadata.
     * @implements IVideoMetadata
     * @constructor
     * @param {IVideoMetadata=} [properties] Properties to set
     */
    function VideoMetadata(properties) {
        if (properties)
            for (var keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null)
                    this[keys[i]] = properties[keys[i]];
    }

    /**
     * VideoMetadata param1.
     * @member {string} param1
     * @memberof VideoMetadata
     * @instance
     */
    VideoMetadata.prototype.param1 = "";

    /**
     * VideoMetadata param2.
     * @member {string} param2
     * @memberof VideoMetadata
     * @instance
     */
    VideoMetadata.prototype.param2 = "";

    /**
     * Creates a new VideoMetadata instance using the specified properties.
     * @function create
     * @memberof VideoMetadata
     * @static
     * @param {IVideoMetadata=} [properties] Properties to set
     * @returns {VideoMetadata} VideoMetadata instance
     */
    VideoMetadata.create = function create(properties) {
        return new VideoMetadata(properties);
    };

    /**
     * Encodes the specified VideoMetadata message. Does not implicitly {@link VideoMetadata.verify|verify} messages.
     * @function encode
     * @memberof VideoMetadata
     * @static
     * @param {IVideoMetadata} message VideoMetadata message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    VideoMetadata.encode = function encode(message, writer) {
        if (!writer)
            writer = $Writer.create();
        if (message.param1 != null && Object.hasOwnProperty.call(message, "param1"))
            writer.uint32(/* id 1, wireType 2 =*/10).string(message.param1);
        if (message.param2 != null && Object.hasOwnProperty.call(message, "param2"))
            writer.uint32(/* id 2, wireType 2 =*/18).string(message.param2);
        return writer;
    };

    /**
     * Encodes the specified VideoMetadata message, length delimited. Does not implicitly {@link VideoMetadata.verify|verify} messages.
     * @function encodeDelimited
     * @memberof VideoMetadata
     * @static
     * @param {IVideoMetadata} message VideoMetadata message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    VideoMetadata.encodeDelimited = function encodeDelimited(message, writer) {
        return this.encode(message, writer).ldelim();
    };

    /**
     * Decodes a VideoMetadata message from the specified reader or buffer.
     * @function decode
     * @memberof VideoMetadata
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {VideoMetadata} VideoMetadata
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    VideoMetadata.decode = function decode(reader, length, error) {
        if (!(reader instanceof $Reader))
            reader = $Reader.create(reader);
        var end = length === undefined ? reader.len : reader.pos + length, message = new $root.VideoMetadata();
        while (reader.pos < end) {
            var tag = reader.uint32();
            if (tag === error)
                break;
            switch (tag >>> 3) {
            case 1: {
                    message.param1 = reader.string();
                    break;
                }
            case 2: {
                    message.param2 = reader.string();
                    break;
                }
            default:
                reader.skipType(tag & 7);
                break;
            }
        }
        return message;
    };

    /**
     * Decodes a VideoMetadata message from the specified reader or buffer, length delimited.
     * @function decodeDelimited
     * @memberof VideoMetadata
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @returns {VideoMetadata} VideoMetadata
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    VideoMetadata.decodeDelimited = function decodeDelimited(reader) {
        if (!(reader instanceof $Reader))
            reader = new $Reader(reader);
        return this.decode(reader, reader.uint32());
    };

    /**
     * Verifies a VideoMetadata message.
     * @function verify
     * @memberof VideoMetadata
     * @static
     * @param {Object.<string,*>} message Plain object to verify
     * @returns {string|null} `null` if valid, otherwise the reason why it is not
     */
    VideoMetadata.verify = function verify(message) {
        if (typeof message !== "object" || message === null)
            return "object expected";
        if (message.param1 != null && message.hasOwnProperty("param1"))
            if (!$util.isString(message.param1))
                return "param1: string expected";
        if (message.param2 != null && message.hasOwnProperty("param2"))
            if (!$util.isString(message.param2))
                return "param2: string expected";
        return null;
    };

    /**
     * Creates a VideoMetadata message from a plain object. Also converts values to their respective internal types.
     * @function fromObject
     * @memberof VideoMetadata
     * @static
     * @param {Object.<string,*>} object Plain object
     * @returns {VideoMetadata} VideoMetadata
     */
    VideoMetadata.fromObject = function fromObject(object) {
        if (object instanceof $root.VideoMetadata)
            return object;
        var message = new $root.VideoMetadata();
        if (object.param1 != null)
            message.param1 = String(object.param1);
        if (object.param2 != null)
            message.param2 = String(object.param2);
        return message;
    };

    /**
     * Creates a plain object from a VideoMetadata message. Also converts values to other types if specified.
     * @function toObject
     * @memberof VideoMetadata
     * @static
     * @param {VideoMetadata} message VideoMetadata
     * @param {$protobuf.IConversionOptions} [options] Conversion options
     * @returns {Object.<string,*>} Plain object
     */
    VideoMetadata.toObject = function toObject(message, options) {
        if (!options)
            options = {};
        var object = {};
        if (options.defaults) {
            object.param1 = "";
            object.param2 = "";
        }
        if (message.param1 != null && message.hasOwnProperty("param1"))
            object.param1 = message.param1;
        if (message.param2 != null && message.hasOwnProperty("param2"))
            object.param2 = message.param2;
        return object;
    };

    /**
     * Converts this VideoMetadata to JSON.
     * @function toJSON
     * @memberof VideoMetadata
     * @instance
     * @returns {Object.<string,*>} JSON object
     */
    VideoMetadata.prototype.toJSON = function toJSON() {
        return this.constructor.toObject(this, $protobuf.util.toJSONOptions);
    };

    /**
     * Gets the default type url for VideoMetadata
     * @function getTypeUrl
     * @memberof VideoMetadata
     * @static
     * @param {string} [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
     * @returns {string} The default type url
     */
    VideoMetadata.getTypeUrl = function getTypeUrl(typeUrlPrefix) {
        if (typeUrlPrefix === undefined) {
            typeUrlPrefix = "type.googleapis.com";
        }
        return typeUrlPrefix + "/VideoMetadata";
    };

    return VideoMetadata;
})();

undefined;
