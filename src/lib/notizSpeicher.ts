/** Serial writes prevent an older response overwriting the final note. No delayed write is discarded on unmount. */
export function erstelleNotizSpeicher(schreibe: (text: string) => Promise<boolean>) {
  let kette = Promise.resolve(true);
  return (text: string) => {
    kette = kette.catch(() => false).then(() => schreibe(text)).catch(() => false);
    return kette;
  };
}
