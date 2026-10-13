import { useState } from "react";
import { Check, Copy, KeyRound, X } from "lucide-react";

/**
 * One-time display of an External View link that contains a new access key.
 * The key is not stored in readable form, so it cannot be shown again.
 */
export function GeneratedLinkBanner({
  viewName,
  link,
  onClose,
}: {
  viewName: string;
  link: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // Relative External View URLs are made absolute for use in BIC/BECS.
  const fullLink = link.startsWith("/")
    ? `${window.location.origin}${link}`
    : link;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(fullLink);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="ev-key-banner" role="status">
      <div className="ev-key-banner-head">
        <strong>
          <KeyRound size={16} /> New secure link for “{viewName}”
        </strong>
        <button
          type="button"
          className="icon-button"
          title="Close"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <p>
        Use this link in BIC/BECS. Copy it now — the access key cannot be shown
        again. Generating a new key revokes the previous link.
      </p>
      <div className="ev-key-link">
        <code>{fullLink}</code>
        <button type="button" className="secondary-button" onClick={copy}>
          {copied ? <Check size={15} /> : <Copy size={15} />}
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>
    </div>
  );
}
