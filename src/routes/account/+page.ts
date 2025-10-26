export const load = async ({ parent }: { parent: () => Promise<{ session: any }> }) => {
	const { session } = await parent();
	return {
		session
	};
};
