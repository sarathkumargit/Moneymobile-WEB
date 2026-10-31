import {
  LayoutDashboard, Store, UserCog, Users, Smartphone, Boxes, HardDrive, MonitorSmartphone,
  FileText, CreditCard, KeyRound, BarChart3, ScrollText, Settings, ShieldCheck,
  UserSquare, Wallet, UserCircle, Download,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Role = "super_admin" | "shop_admin" | "employee";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  soon?: boolean; // module not built yet (prototype)
};

export const roleMeta: Record<Role, { title: string; base: string }> = {
  super_admin: { title: "Super Admin", base: "/super-admin" },
  shop_admin: { title: "Shop Admin", base: "/shop" },
  employee: { title: "Employee", base: "/employee" },
};

export const navByRole: Record<Role, NavItem[]> = {
  super_admin: [
    { label: "Overview", href: "/super-admin", icon: LayoutDashboard },
    { label: "Shops", href: "/super-admin/shops", icon: Store },
    { label: "Shop Owners", href: "/super-admin/owners", icon: UserCog },
    { label: "Employees", href: "/super-admin/employees", icon: Users },
    { label: "Customers", href: "/super-admin/customers", icon: UserSquare },
    { label: "Phone Models", href: "/super-admin/models", icon: Smartphone },
    { label: "Inventory", href: "/super-admin/inventory", icon: Boxes },
    { label: "Devices", href: "/super-admin/devices", icon: HardDrive },
    { label: "Installments", href: "/super-admin/installments", icon: FileText },
    { label: "Payments", href: "/super-admin/payments", icon: CreditCard },
    { label: "Temporary Unlocks", href: "/super-admin/unlocks", icon: KeyRound },
    { label: "Reports", href: "/super-admin/reports", icon: BarChart3 },
    { label: "Audit Logs", href: "/super-admin/audit", icon: ScrollText },
    { label: "Settings", href: "/super-admin/settings", icon: Settings },
  ],
  shop_admin: [
    { label: "Overview", href: "/shop", icon: LayoutDashboard },
    { label: "Inventory", href: "/shop/inventory", icon: Boxes },
    { label: "Phone Models", href: "/shop/models", icon: Smartphone },
    { label: "Devices", href: "/shop/devices", icon: HardDrive },
    { label: "Device Mgmt", href: "/shop/device-management", icon: MonitorSmartphone },
    { label: "Install App", href: "/shop/install-app", icon: Download },
    { label: "Customers", href: "/shop/customers", icon: UserSquare },
    { label: "Guarantors", href: "/shop/guarantors", icon: ShieldCheck },
    { label: "Installments", href: "/shop/installments", icon: FileText },
    { label: "Payments", href: "/shop/payments", icon: CreditCard },
    { label: "Employees", href: "/shop/employees", icon: Users },
    { label: "Temporary Unlocks", href: "/shop/unlocks", icon: KeyRound },
    { label: "Reports", href: "/shop/reports", icon: BarChart3 },
    { label: "Shop Settings", href: "/shop/settings", icon: Settings },
  ],
  employee: [
    { label: "Overview", href: "/employee", icon: LayoutDashboard },
    { label: "Assigned Devices", href: "/employee/devices", icon: HardDrive },
    { label: "Install App", href: "/employee/install-app", icon: Download },
    { label: "Customers", href: "/employee/customers", icon: UserSquare },
    { label: "Inventory", href: "/employee/inventory", icon: Boxes },
    { label: "Installments", href: "/employee/installments", icon: FileText },
    { label: "Payments", href: "/employee/payments", icon: Wallet },
    { label: "Unlock Requests", href: "/employee/unlocks", icon: KeyRound },
    { label: "Profile", href: "/employee/profile", icon: UserCircle },
  ],
};
