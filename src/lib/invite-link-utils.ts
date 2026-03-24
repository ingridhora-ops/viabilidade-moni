/** Indica se o link de convite aponta para máquina local (convidado não consegue abrir). */
export function inviteLinkIsLocalhost(inviteLink: string): boolean {
  return /\blocalhost\b|127\.0\.0\.1/i.test(inviteLink);
}
