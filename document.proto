syntax = "proto3";

message Document {
  message Text {
    string text = 1;
    int32 width = 2;
  }

  message Character {
    Text hanzi = 1;
    optional Text zhuyin = 2;
  }

  repeated Character characters = 1;
}
