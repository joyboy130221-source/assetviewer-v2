# Asset Viewer site filter fix

The Asset Viewer API no longer hardcodes `siteid="BEDFORD"` when retrieving or locating an asset.

The Maximo OSLC filter is now based only on the requested asset number:

```text
assetnum="<assetId>"
```

This change applies to both reading an asset and locating its resource before an attribute update through `server/api/asset.js`.

No database migration is required.

Note: if the same `assetnum` exists in more than one Maximo site, Maximo can return more than one matching record. The current Asset Viewer retains its existing single-record behavior and uses the first matching member for display / the existing `findSingle` behavior for update.
