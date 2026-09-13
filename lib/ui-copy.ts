export const SAFE_USE_WARNING =
  "Do not enter passwords, security codes, recovery keys, serial numbers, or any personal or company-confidential information.";

export function toTicketPlatform(device: string): string {
  switch (device) {
    case "Mac":
      return "macOS";
    case "Windows":
    case "iOS":
    case "Android":
      return device;
    default:
      return "Other";
  }
}
