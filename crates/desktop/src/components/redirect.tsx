import { useEffect, useRef } from "react";
import { useLocation } from "wouter";

export function Redirect({ to }: { to: string }) {
	const [, setLocation] = useLocation();
	const redirectedRef = useRef<string | null>(null);

	useEffect(() => {
		if (redirectedRef.current !== to) {
			redirectedRef.current = to;
			setLocation(to, { replace: true });
		}
	}, [to, setLocation]);

	return null;
}
