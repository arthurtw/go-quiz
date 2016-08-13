#!/bin/bash

PATH=./node_modules/.bin:$PATH
JSFILE=build/go-quiz.js

mkdir -p build
cp src/go-quiz.html build

echo -n '/*! MIT license, more info: wgo.waltheri.net */ ' > $JSFILE
cat wgo/wgo.min.js >> $JSFILE
echo '' >> $JSFILE
echo -n '/*! MIT license, more info: github.com/arthurtw/go-quiz */ ' >> $JSFILE
browserify src/go-quiz.js | uglifyjs >> $JSFILE
ls -l build/go-quiz.* && cat << EOM

go-quiz files built successfully

EOM

