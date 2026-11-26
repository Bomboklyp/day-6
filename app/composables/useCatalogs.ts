import type {
  ApiCatalogs,
  ApiCategory,
  ApiCollection,
  ApiCustomer,
  ApiUser,
} from "../../shared/types/api";
export function useCatalogs() {
  const requestFetch = useApi();
  return useAsyncData<ApiCatalogs>(
    "workflow-api-catalogs",
    async (_app, { signal }) => {
      const [users, customers, categories] = await Promise.all([
        requestFetch<ApiCollection<ApiUser>>("/api/users", {
          signal,
          retry: 0,
        }),
        requestFetch<ApiCollection<ApiCustomer>>("/api/customers", {
          signal,
          retry: 0,
        }),
        requestFetch<ApiCollection<ApiCategory>>("/api/categories", {
          signal,
          retry: 0,
        }),
      ]);
      return {
        users: users.data,
        customers: customers.data,
        categories: categories.data,
      };
    },
    { lazy: true },
  );
}
