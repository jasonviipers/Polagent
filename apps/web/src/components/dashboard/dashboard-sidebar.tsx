"use client";

import {
  BarChart3,
  Bot,
  LayoutGrid,
  TableProperties,
  Wallet,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const data = {
  navMain: [
    {
      title: "General",
      items: [
        {
          icon: LayoutGrid,
          label: "Dashboard",
          href: "/dashboard",
        },
        {
          icon: BarChart3,
          label: "Markets",
          href: "/markets",
        },
        {
          icon: Bot,
          label: "Agent",
          href: "/agent",
        },
        {
          icon: TableProperties,
          label: "Portfolio",
          href: "/portfolio",
        },
        {
          icon: Wallet,
          label: "Wallet",
          href: "/wallet",
        },
      ],
    },
  ],
};

export function DashboardSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="h-13 border-sidebar-border border-b"></SidebarHeader>
      <SidebarContent className="pt-4">
        <TooltipProvider>
          {data.navMain.map((item) => (
            <SidebarGroup key={item.title}>
              <SidebarGroupLabel className="text-muted-foreground/65 uppercase">
                {item.title}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {item.items.map((item) => {
                    const isActive = pathname === item.href;

                    return (
                      <SidebarMenuItem key={item.label}>
                        <Tooltip>
                          <TooltipTrigger
                            render={(props) => (
                              <SidebarMenuButton
                                {...props}
                                className={cn(
                                  "group/menu-button h-9 gap-3 font-medium transition-all duration-300 ease-out group-data-[collapsible=icon]:px-1.25! [&>svg]:size-auto",
                                  isActive && "bg-accent text-accent-foreground"
                                )}
                                render={<Link href={item.href as Route} />}
                              >
                                <div className="flex items-center gap-3">
                                  {item.icon && (
                                    <item.icon
                                      aria-hidden="true"
                                      className={cn(
                                        "size-6 text-muted-foreground/65",
                                        isActive && "text-primary"
                                      )}
                                    />
                                  )}
                                  <span>{item.label}</span>
                                </div>
                              </SidebarMenuButton>
                            )}
                          />
                          <TooltipContent side="right">
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
        </TooltipProvider>
      </SidebarContent>
    </Sidebar>
  );
}
