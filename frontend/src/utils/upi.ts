export function buildUpiPaymentUri(params: {
  upiId: string;
  payeeName: string;
  amountPaise: number;
  note: string;
}) {
  const amount = (params.amountPaise / 100).toFixed(2);
  const search = new URLSearchParams({
    pa: params.upiId.trim(),
    pn: params.payeeName.trim() || "Auto-AI",
    am: amount,
    cu: "INR",
    tn: params.note.trim()
  });
  return `upi://pay?${search.toString()}`;
}

export async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}
