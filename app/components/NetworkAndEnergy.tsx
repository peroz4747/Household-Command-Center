import { Box, Card, CardContent, Typography } from "@mui/material";



export default function NetworkAndEnergy({ items }: { items: any[] } ) {

    return (
        <Card sx={{ minHeight: 340 }}>
              <CardContent>
                <Typography variant="subtitle2" color="secondary">
                  Network & energy
                </Typography>

                <Typography variant="h6" sx={{ mt: 1, mb: 2, fontWeight: 700 }}>
                  Home status details
                </Typography>

                <Box sx={{ display: "grid", gap: 2 }}>
                  {items.map((item: any) => {
                    const Icon = item.icon;

                    return (
                      <Box
                        key={item.title}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          bgcolor: "rgba(148,163,184,0.05)",
                          p: 2,
                          borderRadius: 3,
                        }}
                      >
                        <Box>
                          <Typography sx={{ fontWeight: 700 }}>{item.title}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {item.subtitle}
                          </Typography>
                        </Box>

                        <Icon
                          color={
                            item.color as
                              | "inherit"
                              | "primary"
                              | "secondary"
                              | "error"
                              | "info"
                              | "success"
                              | "warning"
                          }
                        />
                      </Box>
                    );
                  })}
                </Box>
              </CardContent>
            </Card>
    )
}