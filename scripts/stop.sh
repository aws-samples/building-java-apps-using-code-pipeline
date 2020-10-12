#!/bin/bash
set -ex
if pgrep java; then pkill java || true; fi