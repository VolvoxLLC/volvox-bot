import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MessageSquare, Shield, Users, Activity } from "lucide-react";

const stats = [
  {
    title: "Members",
    value: "—",
    description: "Total server members",
    icon: Users,
  },
  {
    title: "Mod Cases",
    value: "—",
    description: "Total moderation actions",
    icon: Shield,
  },
  {
    title: "Messages",
    value: "—",
    description: "AI messages this week",
    icon: MessageSquare,
  },
  {
    title: "Uptime",
    value: "—",
    description: "Bot uptime",
    icon: Activity,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your Bill Bot server.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <CardDescription className="text-xs">
                {stat.description}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Getting Started</CardTitle>
          <CardDescription>
            Welcome to the Bill Bot dashboard. This is the foundation — more
            features are coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              Use the sidebar to navigate between sections. Select a server
              from the dropdown to manage its settings.
            </p>
            <p>
              The dashboard will show real-time stats and management tools as
              they&apos;re built out. For now, you can verify your Discord
              authentication and server access are working correctly.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
