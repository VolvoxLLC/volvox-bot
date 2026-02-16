"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ErrorCardProps {
  title: string;
  description: string;
  digest?: string;
  actions: React.ReactNode;
}

/**
 * Shared error UI card used by both the root error boundary
 * and the dashboard error boundary.
 */
export function ErrorCard({ title, description, digest, actions }: ErrorCardProps) {
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {digest && (
          <p className="text-xs text-muted-foreground">
            Error ID: {digest}
          </p>
        )}
        {actions}
      </CardContent>
    </Card>
  );
}
