"use client";

import * as React from "react";
import { X } from "lucide-react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";

type RightDrawerProps = {
    open: boolean;
    title: React.ReactNode;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    paperSx?: SxProps<Theme>;
};

const defaultPaperSx: SxProps<Theme> = {
    width: { xs: "100vw", sm: 480 },
    maxWidth: "100vw",
    bgcolor: "#1f262a",
    color: "#ffffff",
};

export function RightDrawer({ open, title, onClose, children, footer, paperSx }: RightDrawerProps) {
    const mergedPaperSx: SxProps<Theme> = paperSx
        ? ({ ...(defaultPaperSx as any), ...(paperSx as any) } as any)
        : defaultPaperSx;

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={(_event, _reason) => onClose()}
            PaperProps={{
                sx: mergedPaperSx,
            }}
        >
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        px: 3,
                        py: 2,
                    }}
                >
                    <Typography variant="h5" component="h3" sx={{ fontWeight: 700 }}>
                        {title}
                    </Typography>
                    <IconButton aria-label="Cerrar" onClick={onClose} sx={{ color: "var(--foreground)" }}>
                        <X className="w-4 h-4" />
                    </IconButton>
                </Box>

                <Divider sx={{ borderColor: "var(--input-border)" }} />

                <Box sx={{ flex: 1, overflowY: "auto", px: 3, py: 3 }}>{children}</Box>

                {footer !== undefined && (
                    <>
                        <Divider sx={{ borderColor: "var(--input-border)" }} />
                        <Box sx={{ px: 3, py: 2 }}>{footer}</Box>
                    </>
                )}
            </Box>
        </Drawer>
    );
}
