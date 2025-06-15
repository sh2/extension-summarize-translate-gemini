#!/bin/bash

npx pbjs --target static --out video-metadata.js video-metadata.proto

# You need to edit the following 2 lines of the output file.
#
# -var $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;
# +var $Reader = protobuf.Reader, $Writer = protobuf.Writer, $util = protobuf.util;
#
# -var $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});
# +var $root = protobuf.roots["default"] || (protobuf.roots["default"] = {});
#
# Then, add the following line at the end of the file
#
# undefined;
