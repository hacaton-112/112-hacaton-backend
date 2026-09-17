import { Flex, Link as BolidLink, Text } from "@bolid-ui/themes";
import { ChevronRight } from "lucide-react";
import { useNavigate } from "react-router";

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

/** Хлебные крошки для навигации по вложенным страницам на компонентах Bolid UI. */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  const navigate = useNavigate();

  if (!items || items.length === 0) return null;

  return (
    <nav aria-label="Навигация (хлебные крошки)" className={className}>
      <Flex align="center" gap="2" wrap="wrap">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <Flex key={index} align="center" gap="2">
              {item.to && !isLast ? (
                <BolidLink
                  href={item.to}
                  color="gray"
                  size="2"
                  weight="medium"
                  className="cursor-pointer transition-colors hover:text-(--accent-9)"
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(item.to!);
                  }}
                >
                  {item.label}
                </BolidLink>
              ) : (
                <Text
                  size="2"
                  weight="medium"
                  color={isLast ? undefined : "gray"}
                >
                  {item.label}
                </Text>
              )}
              {!isLast && (
                <ChevronRight
                  size={14}
                  className="text-(--gray-8) shrink-0"
                  aria-hidden
                />
              )}
            </Flex>
          );
        })}
      </Flex>
    </nav>
  );
}
