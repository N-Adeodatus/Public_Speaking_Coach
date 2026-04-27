import { useState } from "react"
import { Plus, MessageSquare, Mic, Trash2, AlertTriangle } from "lucide-react"

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

export function AppSidebar({ threads, activeThreadId, setActiveThreadId, createThread, deleteThread, threadsLoading, onLogoClick }) {
  // Tracks which thread is in "confirm delete" mode
  const [confirmId, setConfirmId] = useState(null);

  const handleDeleteClick = (e, id) => {
    e.stopPropagation();
    setConfirmId(id);
  };

  const handleConfirmDelete = async (e, id) => {
    e.stopPropagation();
    setConfirmId(null);
    await deleteThread(id);
  };

  const handleCancelDelete = (e) => {
    e.stopPropagation();
    setConfirmId(null);
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <button
          onClick={onLogoClick}
          className="flex items-center gap-2 px-2 py-1.5 font-semibold text-lg text-primary hover:opacity-75 transition-opacity w-full text-left"
          title="Back to home"
        >
          <Mic className="h-5 w-5" />
          <span>PS Coach</span>
        </button>
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

                    {/* Confirm-delete state */}
                    {confirmId === thread.id ? (
                      <div className="mx-1 my-0.5 flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        <span className="text-xs text-destructive flex-1 truncate">Delete "{thread.name}"?</span>
                        <button
                          onClick={(e) => handleConfirmDelete(e, thread.id)}
                          className="text-xs font-semibold text-destructive hover:underline shrink-0"
                        >
                          Yes
                        </button>
                        <span className="text-muted-foreground text-xs">·</span>
                        <button
                          onClick={handleCancelDelete}
                          className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      /* Normal row — trash icon appears on hover */
                      <div className="group flex items-center gap-0.5 pr-1">
                        <SidebarMenuButton
                          onClick={() => setActiveThreadId(thread.id)}
                          isActive={activeThreadId === thread.id}
                          className="flex-1 justify-start min-w-0"
                        >
                          <MessageSquare className="h-4 w-4 mr-2 shrink-0" />
                          <span className="truncate">{thread.name}</span>
                        </SidebarMenuButton>

                        <button
                          onClick={(e) => handleDeleteClick(e, thread.id)}
                          title="Delete thread"
                          className="shrink-0 p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all duration-150"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}

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
