import {Box, Button, Card, CardContent, Typography} from "@mui/material";

type Shortcut = {
  label: string;
  icon: React.ElementType;
};

export default function Shortcuts({ shortcuts }: { shortcuts: Shortcut[] }) {

    return (
        <Card sx={{ minHeight: 340 }}>
                <CardContent>
                    <Typography variant="subtitle2" color="secondary">
                    Shortcuts
                    </Typography>

                    <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
                    Quick actions
                    </Typography>

                    <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: {
                        xs: "1fr",
                        sm: "1fr 1fr",
                        },
                        gap: 1,
                    }}
                    >
                    {shortcuts.map((shortcut) => {
                        const Icon = shortcut.icon;

                        return (
                        <Button
                            key={shortcut.label}
                            variant="outlined"
                            fullWidth
                            startIcon={<Icon />}
                            sx={{
                            justifyContent: "flex-start",
                            textTransform: "none",
                            borderRadius: 3,
                            height: 56,
                            }}
                        >
                            {shortcut.label}
                        </Button>
                        );
                    })}
                    </Box>
                </CardContent>
            </Card>
    )
}