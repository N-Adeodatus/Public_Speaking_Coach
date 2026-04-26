import { Plus, MessageSquare, Mic } from "lucide-react"

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
} from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"

export function AppSidebar({ threads, activeThreadId, setActiveThreadId, createThread, threadsLoading }) {
  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2 px-2 py-1.5 font-semibold text-lg text-primary">
          <Mic className="h-5 w-5" />
          <span>PS Coach</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <div className="flex items-center justify-between px-2 mb-2">
            <SidebarGroupLabel className="px-0 mb-0">Practice Threads</SidebarGroupLabel>
          </div>
          <div className="px-2 mb-4">
            <Button onClick={createThread} className="w-full justify-start gap-2" variant="outline">
              <Plus className="h-4 w-4" />
              New Thread
            </Button>
          </div>
          <SidebarGroupContent>
            {threadsLoading ? (
              <div className="text-sm text-muted-foreground px-4 py-2">Loading threads...</div>
            ) : threads.length === 0 ? (
              <div className="text-sm text-muted-foreground px-4 py-2">No practice threads yet.</div>
            ) : (
              <SidebarMenu>
                {threads.map((thread) => (
                  <SidebarMenuItem key={thread.id}>
                    <SidebarMenuButton 
                      onClick={() => setActiveThreadId(thread.id)}
                      isActive={activeThreadId === thread.id}
                      className="w-full justify-start"
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      <span className="truncate">{thread.name}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
