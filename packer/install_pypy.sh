#!/bin/bash

set -e 

cd


if [ -e .bootstrapped ]; then
  exit 0
fi

PYPY_VERSION=2.4.0

wget -q -o pypy.log https://bitbucket.org/pypy/pypy/downloads/pypy-$PYPY_VERSION-linux64.tar.bz2
tar -xf pypy-$PYPY_VERSION-linux64.tar.bz2
mv pypy-$PYPY_VERSION-linux64 pypy

mkdir pypy/lib
ln -s /lib64/libncurses.so.5.9 pypy/lib/libtinfo.so.5

mkdir -p bin

cat > bin/python << EOF
#!/bin/bash
LD_LIBRARY_PATH=pypy/lib:$LID_LIBRARY_PATH pypy/bin/pypy "\$@"
EOF

chmod +x bin/python
bin/python --version

touch .bootstrapped

rm -f pypy-$PYPY_VERSION-linux64.tar.bz2

export PATH=/home/core/bin:$PATH
