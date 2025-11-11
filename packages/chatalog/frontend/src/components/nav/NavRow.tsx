// src/components/nav/NavRow.tsx
import * as React from 'react';
import { NavLink, type NavLinkProps } from 'react-router-dom';
import { alpha } from '@mui/material/styles';
import {
  ListItemButton,
  ListItemIcon,
  ListItemText,
  type ListItemButtonProps,
} from '@mui/material';

type NavRowProps = {
  to: NavLinkProps['to'];
  icon?: React.ReactNode;
  label: string;
  selected?: boolean;
} & Pick<ListItemButtonProps, 'onContextMenu' | 'onClick'>;

export function NavRow({
  to,
  icon,
  label,
  selected,
  onContextMenu,
  onClick,
}: NavRowProps) {
  return (
    <NavLink
      to={to}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
    >
      <ListItemButton
        selected={selected}
        onContextMenu={onContextMenu}
        onClick={onClick}
        sx={(theme) => ({
          borderRadius: 1.5,
          px: 1.25,
          py: 0.75,
          '&.Mui-selected': {
            backgroundColor: alpha(theme.palette.primary.main, 0.12),
            '&:hover': { backgroundColor: alpha(theme.palette.primary.main, 0.18) },
          },
          '&:hover': { backgroundColor: alpha(theme.palette.action.hover, 0.25) },
        })}
      >
        {icon && (
          <ListItemIcon
            sx={{ minWidth: 28, color: 'text.secondary', '& svg': { fontSize: 20 } }}
          >
            {icon}
          </ListItemIcon>
        )}
        <ListItemText
          primary={label}
          primaryTypographyProps={{ noWrap: true, fontSize: 14, fontWeight: 500 }}
        />
      </ListItemButton>
    </NavLink>
  );
}
