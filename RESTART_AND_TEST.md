# Quick Test Instructions

The code has been updated but the server needs to restart to pick up the changes.

## Steps:

1. **Start the server** (in your terminal):
   ```bash
   npm run dev
   ```

2. **Wait for "Ready"** message

3. **Run the test** (in another terminal):
   ```bash
   ./test-download.sh
   ```

## Expected Result:

```
✅ API key valid!
✅ Found collections
✅ Download token generated!
✅ Downloaded successfully!
✅ Zip extraction successful!
✅ Token correctly rejected (already used)
```

Then you should see a downloaded zip file in the directory!

---

If it still doesn't work, check the server console for any error messages about the database schema.
