import { AppFooter } from "@/components/shell/app-footer";

export function Footer({
  signedIn = false,
  staff = false,
}: {
  signedIn?: boolean;
  staff?: boolean;
}) {
  return <AppFooter signedIn={signedIn} staff={staff} />;
}
