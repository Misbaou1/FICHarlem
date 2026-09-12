#!/bin/bash
# Double-click to run the FIC Harlem site on this computer.
# Close the Terminal window that opens to stop it.

cd "$(dirname "$0")"

pkill -f "serve.py" 2>/dev/null
pkill -f "http.server 876" 2>/dev/null
sleep 1

python3 serve.py 8766 &
sleep 2

echo
echo "  Website:           http://localhost:8766/"
echo "  Registration form: http://localhost:8766/registration"
echo
echo "Leave this window open. Close it when you are done."
echo

open "http://localhost:8766/"
wait
