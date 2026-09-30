import {
  Home,
  ShoppingBasket,
  Coffee,
  Car,
  ShoppingBag,
  Play,
  Plane,
  Heart,
  Zap,
  Wrench,
  Gift,
  Wallet,
  BookOpen,
  Users,
  PawPrint,
  Ellipsis,
  type LucideIcon,
} from "lucide-react";
const icons: Record<string, LucideIcon> = {
  home: Home,
  basket: ShoppingBasket,
  coffee: Coffee,
  car: Car,
  bag: ShoppingBag,
  play: Play,
  plane: Plane,
  heart: Heart,
  zap: Zap,
  wrench: Wrench,
  gift: Gift,
  wallet: Wallet,
  book: BookOpen,
  users: Users,
  paw: PawPrint,
  dots: Ellipsis,
};
export function CategoryIcon({
  name,
  size = 19,
}: {
  name: string;
  size?: number;
}) {
  const Icon = icons[name] ?? Ellipsis;
  return <Icon size={size} strokeWidth={1.8} />;
}
export const iconNames = Object.keys(icons);
